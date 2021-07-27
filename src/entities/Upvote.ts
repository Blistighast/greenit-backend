import { Field, ObjectType } from "type-graphql";
import { BaseEntity, Column, Entity, ManyToOne, PrimaryColumn } from "typeorm";
import { Post } from "./Post";
import { User } from "./User";

// many to many
// users can upvote many posts and posts can be upvoted by many users
// user -> join table <- posts
// user -> upvote <- posts

@ObjectType() // allows this class to be read by graphql
@Entity()
export class Upvote extends BaseEntity { // baseEntity allows for easy commands eg: Post.insert
  @Field()
  @Column({type: 'int'})
  value: number; // up or down vote, 1 or -1


  @Field()
  @PrimaryColumn()
  userId: number;
  
  @Field(() => User)
  @ManyToOne(() => User, user => user.upvotes)
  user: User;

  @Field()
  @PrimaryColumn()
  postId: number;

  @Field(() => Post)
  @ManyToOne(() => Post, post => post.upvotes, 
    // {
    //   // cascade way of deleting post from upvote table
    //   onDelete: 'CASCADE',
    // }
  )
  post: Post;
}