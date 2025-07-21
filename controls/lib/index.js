/** @jsxImportSource @emotion/react */
/**
 * SimulationControls message formats:
 *   Play:   { type: "simulation", action: "play" }
 *   Pause:  { type: "simulation", action: "pause" }
 *   Reset:  { type: "simulation", action: "reset" }
 *   Send:   { type: "message", value: message }
 */
import React, { useState, useCallback } from "react";
import { css } from "@emotion/react";
import IconButton from "@material-ui/core/IconButton";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import PlayArrowIcon from "@material-ui/icons/PlayArrow";
import PauseIcon from "@material-ui/icons/Pause";
import RefreshIcon from "@material-ui/icons/Refresh";
import SendIcon from "@material-ui/icons/Send";
import { useMessaging } from "@footron/controls-client";

const containerStyle = css`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
  max-width: 350px;
`;

const buttonRowStyle = css`
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: center;
`;

const SimulationControls = () => {
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { sendMessage } = useMessaging();

  const handleToggleSimulation = useCallback(async () => {
    setSimulationRunning((prev) => {
      const next = !prev;
      sendMessage({ type: "simulation", action: next ? "play" : "pause" });
      return next;
    });
  }, [sendMessage]);

  const handleReset = useCallback(() => {
    setSimulationRunning(false);
    sendMessage({ type: "simulation", action: "reset" });
  }, [sendMessage]);

  const handleSend = useCallback(async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await Promise.resolve(sendMessage({ type: "message", value: message }));
      setMessage("");
    } catch (e) {
      // Optionally handle error
    } finally {
      setSending(false);
    }
  }, [message, sendMessage]);

  const handleInputKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div css={containerStyle}>
      <div css={buttonRowStyle}>
        <IconButton onClick={handleToggleSimulation} color="primary" aria-label="toggle simulation">
          {simulationRunning ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <IconButton onClick={handleReset} color="secondary" aria-label="reset simulation">
          <RefreshIcon />
        </IconButton>
      </div>
      <TextField
        label="Enter your message..."
        multiline
        minRows={2}
        maxRows={4}
        variant="outlined"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyPress={handleInputKeyPress}
        disabled={sending}
        fullWidth
      />
      <Button
        variant="contained"
        color="primary"
        endIcon={<SendIcon />}
        onClick={handleSend}
        disabled={sending || !message.trim()}
      >
        {sending ? "Analyzing..." : "Send"}
      </Button>
    </div>
  );
};

export default SimulationControls;
