import { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { createUpvoteLoader } from './utils/createUpvoteLoader';
// import { Session, SessionData } from 'express-session';
import { createUserLoader } from './utils/createUserLoader';

export type MyContext = {
  req: Request & { session: { userId?: number } };
  redis: Redis;
  // req: Request & {
  //   session: Session & Partial<SessionData> & { userId?: number };
  // };
  res: Response;
  userLoader: ReturnType<typeof createUserLoader>;
  upvoteLoader: ReturnType<typeof createUpvoteLoader>;
};
