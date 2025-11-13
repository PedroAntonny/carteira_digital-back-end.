import { User, Wallet } from '@prisma/client';

export type AuthenticatedUser = Omit<User, 'password'> & {
  wallet: Wallet | null;
};
