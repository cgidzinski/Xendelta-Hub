import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Paper,
  Switch,
  FormControlLabel,
  Slider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Divider,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import {
  Settings as SettingsIcon,
  Notifications,
  Security,
  Palette,
  Language,
  VolumeUp,
  Wifi,
  Lock,
} from "@mui/icons-material";
import { useTitle } from "../../../hooks/useTitle";
import { useAuth } from "../../../contexts/AuthContext";
import { useState } from "react";

export default function Settings() {
  const { user } = useAuth();
  useTitle("Settings");
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoSave, setAutoSave] = useState(true);
  const [volume, setVolume] = useState(70);
  const [language, setLanguage] = useState("en");

  return (
    <Box>
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            Settings
          </Typography>
          <Typography variant="h6" color="text.secondary">
            Manage your preferences and account settings
          </Typography>
        </Box>

        {/* Settings Sections */}
        <Grid container spacing={3} sx={{ opacity: 0.25 }}>
          {/* Notifications */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Notifications color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Notifications</Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <FormControlLabel
                    control={<Switch checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />}
                    label="Enable notifications"
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Receive updates about your projects and activities
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Appearance */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Palette color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Appearance</Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <FormControlLabel
                    control={<Switch checked={darkMode} onChange={(e) => setDarkMode(e.target.checked)} />}
                    label="Dark mode"
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Switch between light and dark themes
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* General Settings */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <SettingsIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">General</Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <FormControlLabel
                    control={<Switch checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />}
                    label="Auto-save changes"
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
                    Automatically save your work as you type
                  </Typography>

                  <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                    <InputLabel>Language</InputLabel>
                    <Select value={language} label="Language" onChange={(e) => setLanguage(e.target.value)}>
                      <MenuItem value="en">English</MenuItem>
                      <MenuItem value="es">Spanish</MenuItem>
                      <MenuItem value="fr">French</MenuItem>
                      <MenuItem value="de">German</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Audio Settings */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <VolumeUp color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Audio</Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Master Volume: {volume}%
                  </Typography>
                  <Slider
                    value={volume}
                    onChange={(e, newValue) => setVolume(newValue as number)}
                    valueLabelDisplay="auto"
                    step={10}
                    marks
                    min={0}
                    max={100}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          {/* Security Settings */}
          <Grid size={{ xs: 12 }}>
            <Card elevation={2}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                  <Security color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Security</Typography>
                </Box>
                <Box sx={{ mt: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Box>
                      <Typography variant="body1">Two-Factor Authentication</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Add an extra layer of security to your account
                      </Typography>
                    </Box>
                    <Button variant="outlined" size="small">
                      Enable
                    </Button>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                    <Box>
                      <Typography variant="body1">Change Password</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Update your account password
                      </Typography>
                    </Box>
                    <Button variant="outlined" size="small">
                      Change
                    </Button>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box>
                      <Typography variant="body1">Active Sessions</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Manage your active login sessions
                      </Typography>
                    </Box>
                    <Button variant="outlined" size="small">
                      Manage
                    </Button>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
