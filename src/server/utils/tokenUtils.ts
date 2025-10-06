import jwt from "jsonwebtoken";

export const TOKEN_EXPIRATION = "24hr";

interface TokenData {
  _id: string;
  username: string;
  email: string;
  avatar: string;
}

export const generateToken = (userData: TokenData): string => {
  const tokenData = {
    _id: userData._id,
    username: userData.username,
    email: userData.email,
    avatar: userData.avatar,
  };
  
  return jwt.sign(tokenData, process.env.JWT_SECRET || 'fallback-secret-key-for-development', { expiresIn: TOKEN_EXPIRATION });
};
