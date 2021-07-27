import DataLoader from "dataloader";
import { Upvote } from "../entities/Upvote";

// [{postId: 5, userId: 10}]
// {postId: 5, userId: 10, value: 1}


export const createUpvoteLoader = () => 
new DataLoader<{postId: number, userId: number}, Upvote | null>(
  async (keys) => {
  //find upvotes based on ids in key, postId & userId
  const upvotes = await Upvote.findByIds(keys as any);
  // combine posts with thier id into object
  const upvoteIdToUpvote: Record<string, Upvote> = {};
  upvotes.forEach(upvote => {
    upvoteIdToUpvote[`${upvote.userId} | ${upvote.postId}`] = upvote;
  })

  // change object into array
  return keys.map(key => upvoteIdToUpvote[`${key.userId} | ${key.postId}`])
})