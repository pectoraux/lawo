/**
 * Demo account catalog — referenced by both the seed script and the UI's
 * quick-login buttons. Passwords are deliberately simple and PUBLISHED in the
 * UI for demo purposes (real accounts must not embed secrets in client code).
 *
 * These accounts are isDemo=true — they are pre-ACTIVE (no waitlist gating).
 */

export type DemoRole = 'GUEST' | 'USER' | 'OPERATOR' | 'PACKAGER' | 'ADMIN';

export interface DemoAccount {
  id: string;
  email: string;
  password: string;
  name: string;
  role: DemoRole;
  description: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'demo_guest',
    email: 'guest@nomos.demo',
    password: 'nomos-guest',
    name: 'Guest Visitor',
    role: 'GUEST',
    description: 'Read-only explorer — browse the platform without modifying state.',
  },
  {
    id: 'demo_user',
    email: 'user@nomos.demo',
    password: 'nomos-user',
    name: 'Kwame Mensah',
    role: 'USER',
    description: 'A Ghanaian individual user with a personal tenant — full evaluation access.',
  },
  {
    id: 'demo_operator',
    email: 'operator@nomos.demo',
    password: 'nomos-operator',
    name: 'Ama Boateng',
    role: 'OPERATOR',
    description: 'Enterprise operator — can persist decisions and review audit across a tenant.',
  },
  {
    id: 'demo_packager',
    email: 'packager@nomos.demo',
    password: 'nomos-packager',
    name: 'Yao Koffi',
    role: 'PACKAGER',
    description: 'Rule packager — can draft and review jurisdiction/domain/situation packages.',
  },
  {
    id: 'demo_admin',
    email: 'admin@nomos.demo',
    password: 'nomos-admin',
    name: 'Nomos Admin',
    role: 'ADMIN',
    description: 'Platform administrator — full access including waitlist approval.',
  },
];
