import React from "react";
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Avatar,
  Divider,
  Badge,
} from "@mui/material";
import TitleBar from "../../components/TitleBar";

interface Message {
  id: string;
  from: string;
  message: string;
  timestamp: string;
  isRead: boolean;
}

const mockMessages: Message[] = [
  {
    id: "1",
    from: "john.doe@example.com",
    message: "Here is the latest update on our project progress...",
    timestamp: "2 hours ago",
    isRead: false,
  },
  {
    id: "2",
    from: "sarah.wilson@company.com",
    message: "Don't forget about our team meeting tomorrow at 10 AM...",
    timestamp: "4 hours ago",
    isRead: true,
  },
  {
    id: "3",
    from: "support@service.com",
    message: "Please verify your account by clicking the link below...",
    timestamp: "1 day ago",
    isRead: false,
  },
  {
    id: "4",
    from: "newsletter@tech.com",
    message: "This week in technology: AI breakthroughs, new frameworks...",
    timestamp: "2 days ago",
    isRead: true,
  },
];

export default function Mail() {
  return (
    <Box>
      <TitleBar title="Messages" />
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Messages
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Manage your conversations and messages
          </Typography>
        </Box>

        <Card elevation={3}>
          <Box>
            <List sx={{ p: 0 }}>
              {mockMessages.map((message, index) => (
                <Box key={message.id}>
                  <ListItem
                    sx={{
                      "&:hover": { backgroundColor: "action.selected" },
                    }}
                  >
                    <ListItemIcon>
                      <Badge badgeContent={message.isRead ? 0 : 1} variant="dot" color="warning">
                      <Avatar sx={{ width: 32, height: 32, fontSize: "0.875rem" }}>
                          {message.from.charAt(0).toUpperCase()}
                        </Avatar>
                      </Badge>
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box component="div" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography
                            variant="body1"
                            sx={{
                              fontWeight: message.isRead ? "normal" : "bold",
                              flex: 1,
                            }}
                          >
                            {message.from}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {message.timestamp}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {message.message}
                        </Typography>
                      }
                    />
                  </ListItem>
                  {index < mockMessages.length - 1 && <Divider variant="inset" />}
                </Box>
              ))}
            </List>
          </Box>
        </Card>
      </Container>
    </Box>
  );
}
