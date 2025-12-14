import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
const { User } = require('../models/user');
import { generateToken } from '../utils/tokenUtils';
import { downloadAvatarFromUrl } from '../utils/avatarUtils';

// Check for required environment variables
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET not found in environment variables. Using fallback secret.');
}

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  WARNING: Google OAuth credentials not found. Google login will not work.');
}

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  console.warn('⚠️  WARNING: GitHub OAuth credentials not found. GitHub login will not work.');
}

// JWT Strategy Configuration
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET || 'fallback-secret-key-for-development',
};

// JWT Strategy
passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    const user = await User.findOne({ _id: payload._id }).exec();
    
    if (user) {
      return done(null, user);
    } else {
      return done(null, false);
    }
  } catch (error) {
    return done(error, false);
  }
}));

// Google OAuth Strategy Configuration
const googleOptions = {
  clientID: process.env.GOOGLE_CLIENT_ID || 'dummy-client-id',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy-client-secret',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
};

// Google OAuth Strategy
passport.use(new GoogleStrategy(googleOptions, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists with this Google ID
    let user = await User.findOne({ 
      'authProviders.provider': 'google',
      'authProviders.providerId': profile.id,
      'authProviders.isActive': true
    }).exec();
    
    if (user) {
      return done(null, user);
    }
    
    // Check if user exists with same email (for account linking)
    user = await User.findOne({ email: profile.emails?.[0]?.value }).exec();
    
    if (user) {
      // Link Google account to existing user
      await user.addAuthProvider('google', profile.id, profile.emails?.[0]?.value);
      return done(null, user);
    }
    
    // Create new user
    user = new User({
      username: profile.displayName || profile.emails?.[0]?.value?.split('@')[0],
      email: profile.emails?.[0]?.value,
      avatar: '/avatars/default-avatar.png', // Default, will update if download succeeds
      notifications: []
    });
    
    // Add Google as auth provider
    await user.addAuthProvider('google', profile.id, profile.emails?.[0]?.value);
    
    // Save user first to get _id
    await user.save();
    
    // Download and save OAuth avatar if available
    if (profile.photos?.[0]?.value) {
      const avatarUrl = await downloadAvatarFromUrl(profile.photos[0].value, user._id.toString()).catch((error) => {
        console.warn('Failed to download Google avatar:', error);
        return null;
      });
      if (avatarUrl) {
        user.avatar = avatarUrl;
        await user.save();
      }
    }
    
    return done(null, user);
  } catch (error) {
    return done(error, false);
  }
}));

// GitHub OAuth Strategy Configuration
const githubOptions = {
  clientID: process.env.GITHUB_CLIENT_ID || 'dummy-client-id',
  clientSecret: process.env.GITHUB_CLIENT_SECRET || 'dummy-client-secret',
  callbackURL: process.env.GITHUB_CALLBACK_URL || '/api/auth/github/callback',
  scope: ["user:email"]
};

// GitHub OAuth Strategy
passport.use(new GitHubStrategy(githubOptions, async (accessToken, refreshToken, profile, done) => {
  try {
    // Get email from profile (now available with user:email scope)
    const userEmail = profile.emails?.[0]?.value;
    
    if (!userEmail) {
      console.warn('No email found in GitHub profile despite user:email scope');
      return done(new Error('No email available from GitHub'), false);
    }
    
    // Check if user already exists with this GitHub ID
    let user = await User.findOne({ 
      'authProviders.provider': 'github',
      'authProviders.providerId': profile.id,
      'authProviders.isActive': true
    }).exec();
    
    if (user) {
      return done(null, user);
    }
    
    // Check if user exists with same email (for account linking)
    if (userEmail) {
      user = await User.findOne({ email: userEmail }).exec();
      
      if (user) {
        // Link GitHub account to existing user
        await user.addAuthProvider('github', profile.id, userEmail);
        return done(null, user);
      }
    }
    
    // Create new user
    user = new User({
      username: profile.username || profile.displayName || userEmail?.split('@')[0] || 'github-user',
      email: userEmail || `${profile.username}@github.local`, // Fallback email if no email available
      avatar: '/avatars/default-avatar.png', // Default, will update if download succeeds
      notifications: []
    });
    
    // Add GitHub as auth provider
    await user.addAuthProvider('github', profile.id, userEmail);
    
    // Save user first to get _id
    await user.save();
    
    // Download and save OAuth avatar if available
    if (profile.photos?.[0]?.value) {
      const avatarUrl = await downloadAvatarFromUrl(profile.photos[0].value, user._id.toString()).catch((error) => {
        console.warn('Failed to download GitHub avatar:', error);
        return null;
      });
      if (avatarUrl) {
        user.avatar = avatarUrl;
        await user.save();
      }
    }
    
    return done(null, user);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return done(error, false);
  }
}));

export default passport;
