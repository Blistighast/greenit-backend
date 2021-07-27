import { Field, Int, ObjectType } from "type-graphql";
import { BaseEntity, Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Upvote } from "./Upvote";
import { User } from "./User";

@ObjectType() // allows this class to be read by graphql
@Entity()
export class Post extends BaseEntity { // baseEntity allows for easy commands eg: Post.insert
  @Field() // field exposes data to the graphql schema
  @PrimaryGeneratedColumn()
  id!: number;

  @Field()
  @Column()
  title!: string;

  @Field()
  @Column()
  text!: string;

  @Field()
  @Column({ type: "int", default: 0 })
  points!: number

  @Field(() => Int, {nullable: true})
  voteStatus: number | null // 1 or -1 or null

  @Field()
  @Column()
  creatorId: number;
  
  @Field()
  @ManyToOne(() => User, user => user.posts)
  creator: User;
  
  @OneToMany(() => Upvote, upvotes => upvotes.post)
  upvotes: Upvote[];

  @Field(() => String)
  @CreateDateColumn()
  createdAt: Date;

  @Field(() => String)
  @UpdateDateColumn()
  updatedAt: Date;
}