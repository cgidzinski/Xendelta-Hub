# Xendelta Hub

A full-stack collaboration platform built with React and Express, featuring real-time messaging, blog management, and team collaboration tools.

## Features

- **Real-time Messaging**: Instant messaging with Socket.io for seamless team communication
- **User Authentication**: JWT-based authentication with OAuth support (Google, GitHub)
- **Blog Management**: Full-featured blog system with markdown support and admin controls
- **Notifications**: Smart notification system with real-time updates
- **Admin Dashboard**: User management and content administration
- **Responsive Design**: Mobile-optimized UI built with Material-UI

## Tech Stack

### Frontend
- React 19 + TypeScript
- Material-UI (MUI)
- React Router
- TanStack Query
- Socket.io Client
- Vite

### Backend
- Express.js + TypeScript
- MongoDB with Mongoose
- Socket.io
- Passport.js (JWT, OAuth)
- Google Cloud Storage

## Setup

For detailed setup and deployment instructions, see [VM_SETUP.md](./VM_SETUP.md).

## Project Structure

```
Xendelta-Hub/
├── src/
│   ├── client/          # React frontend
│   │   ├── components/  # Reusable components
│   │   ├── routes/      # Page components
│   │   ├── hooks/       # Custom React hooks
│   │   └── contexts/    # React contexts
│   └── server/          # Express backend
│       ├── routes/      # API routes
│       ├── models/      # MongoDB models
│       ├── middleware/  # Express middleware
│       └── infrastructure/ # Socket.io, database setup
├── public/              # Static assets
└── dist/                # Production build
```

## Author

**Colin Gidzinski**

- GitHub: [@cgidzinski](http://github.com/cgidzinski)
- LinkedIn: [colin-gidzinski](http://linkedin.com/in/colin-gidzinski)
- Email: colingidzinski@gmail.com

## License

This project is private and proprietary.

