export class SurvivorScriptError extends Error {
  constructor(
    message: string,
    public lineNumber?: number
  ) {
    super(
      lineNumber !== undefined
        ? `Line ${lineNumber}: ${message}`
        : message
    );

    this.name = "SurvivorScriptError";
  }
}
