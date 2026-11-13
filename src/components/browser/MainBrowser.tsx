import Box from "@mui/material/Box";
import { HeaderRow1, type HeaderRow1Props } from "./HeaderRow1";
import { HeaderRow2, type HeaderRow2Props } from "./HeaderRow2";

export interface MainBrowserProps {
  /** Master switch for the header toolbar. */
  headerEnabled: boolean;
  /** Props for the first header row. */
  row1: HeaderRow1Props;
  /** Props for the second header row. */
  row2: HeaderRow2Props;
  /** Region input ref — blurred on canvas pointer-down so RAF can resume sync. */
  regionInputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * The main browser column: the optional two-row header toolbar above the
 * renderer canvas mount point (`#tb-rna`).
 */
export function MainBrowser({
  headerEnabled,
  row1,
  row2,
  regionInputRef,
}: MainBrowserProps) {
  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {headerEnabled && (
        <Box
          sx={{
            borderBottom: "1px solid #707070",
            bgcolor: "#fff",
            flexShrink: 0,
          }}
        >
          <HeaderRow1 {...row1} />
          <HeaderRow2 {...row2} />
        </Box>
      )}
      <div
        id="tb-rna"
        style={{
          width: "100%",
          flex: 1,
          minHeight: 0,
          position: "relative",
          border: "1px solid #ccc",
        }}
        onPointerDown={() => {
          // Blur the region input so syncState can resume updating it
          // during canvas drag / zoom.
          regionInputRef.current?.blur();
        }}
      />
    </div>
  );
}
