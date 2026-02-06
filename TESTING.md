
# Testing Instructions for CRUZPHAM TRIVIA STUDIOS

## Regression Test: BootstrapScreen
Locks in the master admin initialization flow.

### Prerequisites
1. Ensure dependencies are installed:
   ```bash
   npm install
   ```

### Running Tests
To run all tests in the project (including the BootstrapScreen regression suite):
```bash
npm test
```

To run only the BootstrapScreen regression tests:
```bash
npx vitest components/BootstrapScreen.test.tsx
```

### Test Coverage
The suite confirms:
- Initial rendering of baseline UI text and default values.
- Trimming of input whitespace before submission.
- Integration with `authService.bootstrapMasterAdmin`.
- Success state handling (Token display, Toast, Haptics).
- Clipboard integration for token security.
- Error path handling (Toast on rejection).
- Security audit (Ensuring no tokens are leaked to `console.log`).
- UI State audit (Ensuring button is disabled during async calls).
