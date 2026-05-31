export type ItemKey = string;

export interface Item {
  key: ItemKey;
  name: string;
  description: string;
  image: string;
  redeemable: boolean;
  apply?: (user: any) => Promise<void>;
}