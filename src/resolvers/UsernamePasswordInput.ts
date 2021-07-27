import { InputType, Field } from "type-graphql";

@InputType() //alternative way from how its done in post with multiple Args
export class UsernamePasswordInput {
  @Field()
  email: string;
  @Field()
  username: string;
  @Field()
  password: string;
}
