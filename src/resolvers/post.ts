import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
  UseMiddleware
} from 'type-graphql';
import { getConnection } from 'typeorm';
import { Post } from '../entities/Post';
import { Upvote } from '../entities/Upvote';
import { User } from '../entities/User';
import { MyContext } from '../types';
import { isAuth } from './../middleware/isAuth';

@InputType()
class PostInput {
  @Field()
  title: string;
  @Field()
  text: string;
}

@ObjectType()
class PaginatedPosts {
  @Field(() => [Post])
  posts: Post[];
  @Field()
  hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
  // queries text of post, creates shorter snippet
  @FieldResolver(() => String) // Field resolver is graphql
  textSnippet(
    @Root() post: Post
  ) {
    return post.text.slice(0, 100);
  }

  // finds creator of queried posts, batches them so it doesnt make many individual sql requests
  @FieldResolver(() => User) // Field resolver is graphql
  creator(
    @Root() post: Post,
    @Ctx() { userLoader }: MyContext,
  ) {
    return userLoader.load(post.creatorId)
  }

  // queries if user has voted and what their vote status is
  @FieldResolver(() => Int, { nullable: true})
  async voteStatus(
    @Root() post: Post,
    @Ctx() { upvoteLoader, req }: MyContext,
  ) {
    if (!req.session.userId) {
      return null;
    }

    const upvote = await upvoteLoader.load({
      postId: post.id, 
      userId: req.session.userId,
    })

    return upvote ? upvote.value : null;
  }


  @Query(() => PaginatedPosts) // graphql needs to know what type is returned
  async posts(
    @Arg("limit", () => Int) limit: number,
    @Arg("cursor", () => String, { nullable: true }) cursor: string | null,
    @Ctx() { req }: MyContext
  ): Promise<PaginatedPosts> {
    const realLimit = Math.min(50, limit); // hard limit of max posts shown
    // fetch 1 extra to check if there are anymore
    const realLimitPlusOne = realLimit + 1;

    const replacements: any[] = [realLimitPlusOne];

    if (cursor) {
      replacements.push(new Date(parseInt(cursor)))
    }

    // sql written directly
    const posts = await getConnection().query(`
    select p.*
    from post p
    ${cursor ? `where p."createdAt" < $2` : ''}
    order by p."createdAt" desc
    limit $1

    `, replacements) // $1, $2 are variables, replaced by replacements
    // need to use json_build to reformat the returned user to work with graphql

    // sql written with query builder
    // const qb = getConnection()
    // .getRepository(Post)
    // .createQueryBuilder("p") // just alias of what to call it
    // .innerJoinAndSelect( // inner join
    //   "p.creator", 
    //   "u", // alias for user
    //   'u.id = p."creatorId"', // join what to what, needs double quotes due to camelcase on creatorId
    // )
    // .orderBy('p."createdAt"', "DESC") // needs to be double quoted to keep proper syntax: ;
    // // from position how many do we want after position
    // .take(realLimitPlusOne) // amount of posts queried at once
    // if (cursor) {
    //   // determines position
    //   qb.where('p."createdAt" < :cursor', { // take where date is less than cursor limit
    //     cursor: new Date(parseInt(cursor)), // needs to be converted to Int before changed to date
    //   }) 
    // }

    // const posts = await qb.getMany()
    return { 
      posts: posts.slice(0, realLimit), 
      hasMore: posts.length === realLimitPlusOne,
    };
  }

  @Query(() => Post, { nullable: true }) 
  post(@Arg('id', () => Int) id: number): Promise<Post | undefined> {
    return Post.findOne(id);
  }

  @Mutation(() => Post)
  @UseMiddleware(isAuth) // checks if there is user first
  async createPost(
    @Arg("input") input: PostInput,
    @Ctx() { req }: MyContext,
  ): Promise<Post> {
    return Post.create({
      ...input,
      creatorId: req.session.userId,
    }).save();
  }

  @Mutation(() => Post, { nullable: true })
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg('id', () => Int) id: number,
    @Arg('title') title: string,
    @Arg('text') text: string,
    @Ctx() { req }: MyContext
  ): Promise<Post | null> {
    const result = await getConnection()
      .createQueryBuilder()
      .update(Post)
      .set({ title, text })
      .where('id = :id and "creatorId" = :creatorId', { id, creatorId: req.session.userId })
      .returning('*')
      .execute();
    
    return result.raw[0];
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg("id", () => Int) id: number,
    @Ctx() { req }: MyContext
  ): Promise<boolean> {
    // delete a post thats been voted on, since it also exists in upvote table 
    // non cascade way, cascade way is in Upvote entity, this is more explicit
    const post = await Post.findOne(id)
    if (!post) {
      return false
    }
    if (post.creatorId !== req.session.userId) {
      throw new Error('not authorized')
    }

    await Upvote.delete({ postId: id });
    await Post.delete({ id, });

    // await Post.delete({ id, creatorId: req.session.userId });
    return true;
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth) // only vote if logged in
  async vote(
    @Arg('postId', () => Int) postId: number,
    @Arg('value', () => Int) value: number,
    @Ctx() { req }: MyContext
  ) {
    const isUpvote = value !== -1;
    const realValue = isUpvote ? 1 : -1;
    const { userId } = req.session;

    const upvote = await  Upvote.findOne({ where: {postId, userId}})

    // the user has voted on the post before and changing their vote to opposite
    if (upvote && upvote.value !== realValue) {
      await getConnection().transaction(async tm => {
        await tm.query(`
          update upvote 
          set value = $1
          where "postId" = $2 and "userId" = $3
      `, [realValue, postId, userId])

        await tm.query(`
          update post 
          set points = points + $1
          where id = $2;
      `, [2 * realValue, postId])

      })
    } else if (!upvote) {
      // has never voted on post before
      await getConnection().transaction(async tm => {
        await tm.query(`
          insert into upvote ("userId", "postId", value)
          values ($1,$2,$3);
        `, [userId, postId, realValue]);

        await tm.query(`
          update post 
          set points = points + $1
          where id = $2;
        `, [realValue, postId])
      })
    }
    return true;
  }

}
function createdAt(createdAt: any) {
  throw new Error('Function not implemented.');
}

