import DataLoader from 'dataloader';
import { User } from '../entities/User';

export const createUserLoader = () =>
  new DataLoader<number, User>(async (userIds) => {
    // finds users based on user id
    const users = await User.findByIds(userIds as number[]);
    // combines users with user id into object
    const userIdToUser: Record<number, User> = {};
    users.forEach(u => {
      userIdToUser[u.id] = u;
    })

    // changes object to array
   return userIds.map(userId => userIdToUser[userId])
  });
