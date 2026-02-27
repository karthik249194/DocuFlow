// FlowDoc AI — code.js (pre-compiled, ready for Figma)
// Drop this directly into your project root — no tsc needed

figma.showUI(__html__, {
  width: 520,
  height: 720,
  title: "FlowDoc AI",
  themeColors: true,
});

// ── Message Router ────────────────────────────────────────────────────────────
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {

    // ── Export current selection as PNG ──────────────────────────────────────
    case "EXPORT_SELECTION": {
      const selection = figma.currentPage.selection;
      if (selection.length === 0) {
        figma.ui.postMessage({
          type: "EXPORT_ERROR",
          error: "No nodes selected. Select a frame or flow to analyse.",
        });
        return;
      }
      try {
        const exportNode = selection.length === 1
          ? selection[0]
          : figma.currentPage;

        const bytes = await exportNode.exportAsync({
          format: "PNG",
          constraint: { type: "SCALE", value: 2 },
        });

        const base64 = figma.base64Encode(bytes);
        figma.ui.postMessage({
          type: "EXPORT_SUCCESS",
          base64,
          nodeCount: selection.length,
        });
      } catch (err) {
        figma.ui.postMessage({ type: "EXPORT_ERROR", error: String(err) });
      }
      break;
    }

    // ── Save a named version checkpoint ──────────────────────────────────────
    case "SAVE_VERSION": {
      const label = msg.payload || ("FlowDoc AI — " + new Date().toLocaleString());
      try {
        await figma.saveVersionHistoryAsync(
          label,
          "Auto-saved by FlowDoc AI on documentation generation."
        );
        figma.ui.postMessage({ type: "VERSION_SAVED", label });
        figma.notify('✓ Version saved: "' + label + '"', { timeout: 3000 });
      } catch (err) {
        figma.ui.postMessage({ type: "VERSION_ERROR", error: String(err) });
      }
      break;
    }

    // ── Get current selection metadata ────────────────────────────────────────
    case "GET_SELECTION_INFO": {
      const selection = figma.currentPage.selection;
      const info = selection.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
      }));
      figma.ui.postMessage({ type: "SELECTION_INFO", nodes: info });
      break;
    }

    // ── Close plugin ──────────────────────────────────────────────────────────
    case "CLOSE":
      figma.closePlugin();
      break;

    default:
      console.warn("[FlowDoc AI] Unknown message type:", msg.type);
  }
};

// Notify UI when Figma selection changes
figma.on("selectionchange", () => {
  const selection = figma.currentPage.selection;
  figma.ui.postMessage({
    type: "SELECTION_CHANGED",
    count: selection.length,
    names: selection.map((n) => n.name),
  });
});
