# Mermaid Navigate — Test

Tap **Pan & zoom** below a diagram to explore it inline, or **Fullscreen** for a screen-filling view.

- Drag with one finger to pan.
- Pinch with two fingers to zoom.
- Use **+**, **−**, **Fit**, or **1:1**.
- Tap **✕** to return to your note. Android Back also closes fullscreen.
- Outside an activated viewer, your note scrolls normally.
- **Show code** opens the fullscreen source editor. Edit Mermaid text, then choose **Save** or **Cancel**.
- **Show diagram** keeps your draft but shows the last saved diagram. Closing an unsaved draft asks you to Save or Cancel first.

## Wide flowchart

```mermaid
flowchart LR
    A([Start here]) --> B[Open a Mermaid diagram]
    B --> C{Choose a view}
    C -->|Stay in your note| D[Tap Pan & zoom]
    C -->|Use the whole screen| E[Tap Fullscreen]
    D --> F[Drag with one finger]
    E --> F
    F --> G[Pinch to zoom in]
    G --> H[Read the small details]
    H --> I[Tap Fit to reset]
    I --> J([Close and keep writing])
    style A fill:#d7e8ff,stroke:#527bcc,color:#142b4d
    style J fill:#d7f2e4,stroke:#41805d,color:#183426
```

## Sequence diagram

```mermaid
sequenceDiagram
    participant You
    participant Vault as Note
    participant Viewer
    You->>Vault: Open a note
    Vault-->>You: Render Mermaid normally
    You->>Viewer: Tap Fullscreen
    loop Explore the diagram
      You->>Viewer: Pinch and drag
      Viewer-->>You: Zoom and pan smoothly
    end
    You->>Viewer: Close
    Viewer-->>Vault: Original diagram remains unchanged
```

## Multiple diagrams stay independent

```mermaid
flowchart TD
    A[Your original Mermaid source] --> B[Obsidian renders the diagram]
    B --> C[Mermaid Navigate adds controls]
    C --> D[Navigation leaves source unchanged]
```

This is a disposable test note added for Mermaid Navigate. You can delete it when finished.
