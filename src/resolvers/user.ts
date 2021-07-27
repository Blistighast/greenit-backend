import argon2 from 'argon2';
import { MyContext } from "src/types";
import { Arg, Ctx, Field, FieldResolver, Mutation, ObjectType, Query, Resolver, Root } from "type-graphql";
import { getConnection } from "typeorm";
import { v4 } from 'uuid';
import { COOKIE_NAME, RESET_PASSWORD_PREFIX } from "../constants";
import { sendEmail } from "../utils/sendEmail";
import { User } from './../entities/User';
import { validateRegister } from './../utils/validateRegister';
import { UsernamePasswordInput } from "./UsernamePasswordInput";

@ObjectType()
class FieldError {
  @Field()
  field: string;
  @Field()
  message: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver(User)
export class UserResolver {
  @FieldResolver(() => String)
  email(
    @Root() user: User, 
    @Ctx() { req }: MyContext
  ) {
    // this is the current user and its ok to show them their own email
    if (req.session.userId === user.id) {
      return user.email
    }
    // current user wants to see someone elses email
    return "";
  }





  @Query(() => User, { nullable: true })
  me(
    @Ctx() { req }: MyContext
  ) {
    console.log(req.session);
    // you are not logged in
    if (!req.session.userId) {
      return null;
    }

    return User.findOne(req.session.userId);
  }

  // REGISTER
  @Mutation(() => UserResponse) 
  async register(
    @Arg('options') options: UsernamePasswordInput,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options);
    if (errors) {
      return {errors};
    }

    const hashedPassword = await argon2.hash(options.password)
    let user;
    try {
      // ALTERNATIVE without query builder
      // const result = await User.create({
      //   username: options.username, 
      //   email: options.email,
      //   password: hashedPassword,
      // })
      // .save();
      const result = await getConnection()
      .createQueryBuilder()
      .insert()
      .into(User)
      .values(
      {        
        username: options.username, 
        email: options.email,
        password: hashedPassword,
      }
      )
      .returning('*')
      .execute();
      user = result.raw[0];
    } catch(err) {
      if (err.code === '23505' || err.detail.includes('already exists') ) {
        // duplicate username error
        return {
          errors: [{
            field: "username",
            message: "username has already been taken",
          }],
        }
      }
    }

    // store user id session
    // this will set a cookie on the user
    //keep them logged in
    req.session.userId = user.id;

    return {
      user,
    }
  }

  // LOGIN
  @Mutation(() => UserResponse) 
  async login(
    @Arg('usernameOrEmail') usernameOrEmail: string,
    @Arg('password') password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const user = await User.findOne(
      usernameOrEmail.includes('@') 
      ? { where: { email: usernameOrEmail } } 
      : { where: { username: usernameOrEmail } }
      );
    if (!user) {
      return {
        errors: [{
          field: 'usernameOrEmail',
          message: "that username or email doesn't exist",
        }]
      }
    }
    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      return {
        errors: [{
          field: 'password',
          message: "incorrect password",
        }]
      }
    }

    req.session.userId = user.id; // saves the user id to the session as a cookie

    return {
      user,
    };
  }

  // LOGOUT
  @Mutation(() => Boolean)
  logout(
    @Ctx() { req, res }: MyContext
  ) {
    return new Promise(resolve => req.session.destroy(err => {
      res.clearCookie(COOKIE_NAME);
      if (err) {
        console.log(err);
        resolve(false);
        return
      }

      resolve(true)
    }))
  }

  // SEND RESETPASSWORD EMAIL
  @Mutation(() => Boolean)
  async resetPassword(
    @Arg('email') email: string,
    @Ctx() {redis}: MyContext
  ) {
    const user = await User.findOne({ where: { email } }); // have to use where when not looking for primary id
    if( !user) {
      // the email is not in the db
      return true;
    }

    const token = v4();

    await redis.set(RESET_PASSWORD_PREFIX + token, user.id, 'ex', 1000 * 60 * 60 * 24 * 3); 
    // 3 days to reset password
    
    await sendEmail(email, 
      `<a href="http://localhost:3000/change-password/${token}">Click here to reset password</a>`
    );

    return true;
  }

  // CHANGE PASSWORD ON USER
  @Mutation(() => UserResponse)
  async changePassword(
    @Arg('token') token: string,
    @Arg('newPassword') newPassword: string,
    @Ctx() { req, redis}: MyContext
  ): Promise<UserResponse> {
    if (newPassword.length <= 2) {
      return {errors: [
        {
          field: 'newPassword',
          message: 'length must be greater than 2',
        },
      ]};
    }

    const key = RESET_PASSWORD_PREFIX + token
    const userId = await redis.get(key)
    if (!userId) {
      return {errors: [
        {
          field: 'token',
          message: 'token expired',
        },
      ]};
    }

    // redis stores id as int, turn to string
    const userIdNum = parseInt(userId)
    const user = await User.findOne(userIdNum);

    if (!user) {
      return {errors: [
        {
          field: 'token',
          message: 'user no longer exists',
        },
      ]};
    }

  await User.update(
    {id: userIdNum},
    {password: await argon2.hash(newPassword)}
    )

  redis.del(key)

  // log in user after change password
  req.session.userId = user.id;

  return {user};
  }
}