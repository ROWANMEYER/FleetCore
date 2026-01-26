# Lint Freeze Notice

- **Purpose**: Temporarily stabilize legacy code while building new Finance features.
- **Scope**: Legacy Convex and Planner files contain `any` and other lint violations.
- **Action**: Lint rules (specifically `no-explicit-any`) are temporarily disabled per-file using `/* eslint-disable ... */`.
- **Plan**: Cleanup and strict typing will be addressed in a dedicated refactor sprint after the Finance module stabilizes.
- **Rule**: New features (Green Zone) must remain strict and lint-free.
