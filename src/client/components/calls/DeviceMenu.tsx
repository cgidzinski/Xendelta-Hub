import { useEffect, useState } from "react";
import { IconButton, ListSubheader, Menu, MenuItem, Tooltip } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { useCall } from "../../contexts/CallContext";

/** A settings button for the call: pick which microphone and camera to use. Names appear once the browser has allowed them. */
export default function DeviceMenu() {
  const { switchDevice, cameraOn } = useCall();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [chosen, setChosen] = useState<{ audio?: string; video?: string }>({});

  useEffect(() => {
    if (!anchor) return;
    void navigator.mediaDevices
      .enumerateDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
  }, [anchor]);

  const mics = devices.filter((d) => d.kind === "audioinput");
  const cameras = devices.filter((d) => d.kind === "videoinput");
  const pick = (kind: "audio" | "video", id: string) => {
    setChosen((c) => ({ ...c, [kind]: id }));
    setAnchor(null);
    void switchDevice(kind, id);
  };

  return (
    <>
      <Tooltip title="Devices">
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Devices" aria-haspopup="menu">
          <SettingsIcon />
        </IconButton>
      </Tooltip>
      <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}>
        <ListSubheader>Microphone</ListSubheader>
        {mics.length === 0 && <MenuItem disabled>No microphones found</MenuItem>}
        {mics.map((d, i) => (
          <MenuItem
            key={d.deviceId || i}
            selected={chosen.audio === d.deviceId}
            onClick={() => pick("audio", d.deviceId)}
          >
            {d.label || `Microphone ${i + 1}`}
          </MenuItem>
        ))}
        <ListSubheader>Camera</ListSubheader>
        {cameras.length === 0 && <MenuItem disabled>No cameras found</MenuItem>}
        {cameras.map((d, i) => (
          <MenuItem
            key={d.deviceId || i}
            selected={chosen.video === d.deviceId}
            disabled={!cameraOn}
            onClick={() => pick("video", d.deviceId)}
          >
            {d.label || `Camera ${i + 1}`}
          </MenuItem>
        ))}
        {!cameraOn && cameras.length > 0 && <MenuItem disabled>Turn the camera on to switch it</MenuItem>}
      </Menu>
    </>
  );
}
