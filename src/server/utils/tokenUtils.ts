import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env";

export const TOKEN_EXPIRATION = "30d";

// Accepts a Mongoose document's own values: _id is an ObjectId and the optional string fields can
// be null/undefined. The token payload stores them as plain strings.
interface TokenData {
  _id: { toString(): string };
  username?: string | null;
  email?: string | null;
}

export const generateToken = (userData: TokenData): string => {
  const tokenData = {
    _id: userData._id.toString(),
    username: userData.username ?? "",
    email: userData.email ?? "",
  };

  return jwt.sign(tokenData, getJwtSecret(), { expiresIn: TOKEN_EXPIRATION });
};
