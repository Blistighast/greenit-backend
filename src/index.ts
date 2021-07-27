/* eslint-disable import/no-named-as-default-member */
/* eslint-disable import/no-named-as-default */
import { ApolloServer } from 'apollo-server-express';
import connectRedis from 'connect-redis';
import cors from 'cors';
import 'dotenv-safe/config';
import express from 'express';
import session from 'express-session';
import Redis from 'ioredis'; // redis, session & connectRedis taken from connect-redis npm api site, rewritten to import
import path from 'path';
import 'reflect-metadata';
import { buildSchema } from 'type-graphql';
import { createConnection } from 'typeorm';
import { __prod__, COOKIE_NAME } from './constants';
import { Post } from './entities/Post';
import { Upvote } from './entities/Upvote';
import { User } from './entities/User';
import { HelloResolver } from './resolvers/hello';
import { PostResolver } from './resolvers/post';
import { UserResolver } from './resolvers/user';
import { MyContext } from './types';
import { createUpvoteLoader } from './utils/createUpvoteLoader';
import { createUserLoader } from './utils/createUserLoader';

// rerun
const main = async () => {
  // created main so the await isnt a  top level function
  const conn = await createConnection({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    logging: true, // shows the queries happening in the terminal
    // synchronize: true, dont want this in production
    migrations: [path.join(__dirname, './migrations/*')],
    entities: [Post, User, Upvote],
  });
  await conn.runMigrations();

  // await Post.delete({});

  const app = express(); // creates server app

  // below and app.use taken from connect-redis npm site api section
  const RedisStore = connectRedis(session);
  const redis = new Redis(process.env.REDIS_URL);
  app.set('trust proxy', 1);
  app.use(
    cors({
      // cors will now apply on all routes
      origin: process.env.CORS_ORIGIN,
      credentials: true,
    })
  );

  // this session middleware needs to be run before apollo middleware
  app.use(
    session({
      name: COOKIE_NAME,
      store: new RedisStore({
        client: redis,
        disableTouch: true, // disable this if session doesnt expire
      }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
        httpOnly: true, // cannot access the cookie from the front end
        sameSite: 'lax', // protects against csrf
        secure: __prod__, // cookie only works in https
        domain: __prod__ ? '.brianguterl.com' : undefined,
      },
      saveUninitialized: false, // dont save empty sessions
      secret: process.env.SESSION_SECRET,
      resave: false,
    })
  );

  const apolloServer = new ApolloServer({
    schema: await buildSchema({
      resolvers: [HelloResolver, PostResolver, UserResolver],
      validate: false,
    }),
    context: ({ req, res }): MyContext => ({
      req,
      res,
      redis,
      userLoader: createUserLoader(),
      upvoteLoader: createUpvoteLoader(),
    }), // special object thats accesible by all resolvers, passes them em
  });

  apolloServer.applyMiddleware({
    app,
    cors: false, // installed cors as a middleware taken care of above
  }); // this creates the graphql api endpoint

  app.listen(parseInt(process.env.PORT), () => {
    console.log('server started on localhost:4000');
  });
};

main().catch((err) => {
  console.error(err);
});
