declare module 'gherkin-lint/dist/linter' {
  interface GherkinLintError {
    message: string;
    rule: string;
    severity?: string;
  }

  interface GherkinLintResult {
    filePath?: string;
    errors?: GherkinLintError[];
  }

  interface GherkinLintConfiguration {
    [key: string]: unknown;
  }

  interface GherkinLinter {
    lint(
      files: string[],
      configuration: GherkinLintConfiguration,
      additionalRules: string[],
    ): Promise<GherkinLintResult[]>;
    readAndParseFile?(filePath: string): Promise<unknown>;
  }

  const linter: GherkinLinter;
  export = linter;
}
