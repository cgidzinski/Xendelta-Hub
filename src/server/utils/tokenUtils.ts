import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/env";

export const TOKEN_EXPIRATION = "30d";

interface TokenData {
  _id: string;
  username: string;
  email: string;
}

export const generateToken = (userData: TokenData): string => {
  const tokenData = {
    _id: userData._id,
    username: userData.username,
    email: userData.email,
  };
  
  return jwt.sign(tokenData, getJwtSecret(), { expiresIn: TOKEN_EXPIRATION });
};
