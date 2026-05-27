export interface Item {
  key: string;
  name: string;
  description: string;
  image: string;
  redeemable: boolean;
  apply?: (user: any) => Promise<void>;
}