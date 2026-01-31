# PDF Generation Module

This module handles the generation of PDF invoices using `jspdf`. It is designed with strict regression guardrails to ensure layout stability and data consistency.

## ⚠️ Critical Layout Rules

The PDF layout is **extremely sensitive**. Please adhere to the following rules when modifying `invoiceTemplate.ts`:

1.  **Absolute Positioning Only**:
    *   Do **NOT** use flow-based logic (e.g., "draw below the previous element").
    *   All zones (Header, Bill To, Description, Totals, Banking) have **FIXED Y-coordinates**.
    *   The unit is **Points (pt)**. Do not change to `mm` or `px`.

2.  **Fixed Zones**:
    *   **Header**: Top of page.
    *   **Bill To**: Fixed at `Y=140`.
    *   **Description**: Fixed at `Y=220`. Content is clamped to max 2 lines to prevent overlapping the Totals block.
    *   **Totals**: **ISOLATED** block fixed at `Y=290`. It does *not* move based on the description length.
    *   **Banking**: Fixed at `Y=360`.

3.  **No Dynamic Layouts**:
    *   Do not introduce tables or flex-like behavior.
    *   Do not allow text to push other elements down. Use `clampText` or `splitTextToSize` with strict line limits.

## 🔧 Architecture & Separation of Concerns

The module is split into three distinct layers:

1.  **`invoiceBuilder.ts` (Data Layer)**
    *   **Responsibility**: Maps raw database records (Routes, Customers) to the `InvoiceData` DTO.
    *   **Constraint**: Must return **RAW** data (Numbers, Dates). No formatting strings allowed here.

2.  **`formatters.ts` (Presentation Logic)**
    *   **Responsibility**: centralized formatting rules.
    *   **Constraint**: All currency/date formatting must happen here.
    *   **Critical Rule**: Currency must be ZAR format (`R 1 234,56`) - Space for thousands, comma for decimals.

3.  **`invoiceTemplate.ts` (View Layer)**
    *   **Responsibility**: Draws the PDF using `jspdf`.
    *   **Constraint**: Purely presentational. No business logic or data transformation. Uses constants for all layout coordinates.

## 📝 How to Modify

*   **To change the Look (Fonts, Colors, Spacing):** Edit `invoiceTemplate.ts`. Ensure you respect the fixed zones.
*   **To change the Data (What appears on the invoice):** Edit `invoiceBuilder.ts`.
*   **To change the Format (Date style, Currency symbol):** Edit `formatters.ts`.

## 🚫 Common Pitfalls to Avoid

*   ❌ **Changing the unit to 'mm'**: This will break all hardcoded coordinates.
*   ❌ **Allowing the Description to grow**: If the description exceeds 2 lines, it *will* overlap the Totals block. Always clamp or truncate.
*   ❌ **Using `toLocaleString()`**: This introduces inconsistency across different servers/browsers. Always use the manual formatting in `formatters.ts`.
