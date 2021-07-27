import { Resolver, Query } from "type-graphql";

@Resolver()
export class HelloResolver {
  @Query(() => String) // graphql needs to know what type is returned
  hello() {
    return "bye"
  }
}