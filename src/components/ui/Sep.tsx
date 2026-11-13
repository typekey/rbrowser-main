import Box from "@mui/material/Box";

export function Sep() {
  return (
    <Box
      sx={{
        width: "1px",
        height: 16,
        bgcolor: "#ddd",
        flexShrink: 0,
        mx: "2px",
      }}
    />
  );
}
