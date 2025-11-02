# Amp-Native Development Infrastructure Guide

## Overview

This repository uses an Amp-native development infrastructure that leverages Amp's unique capabilities to create intelligent development workflows. Unlike traditional Claude Code translations, this approach is designed specifically for Amp's strengths: Oracle (GPT-5), Librarian (cross-repository research), toolboxes, and thread-based knowledge sharing.

## Philosophy

**Amp-First Design**: This infrastructure embraces Amp's unique capabilities rather than mimicking other tools. It focuses on:

- **Oracle (GPT-5)**: A "second opinion" model for complex reasoning tasks
- **Librarian**: Cross-repository and framework documentation research
- **Toolboxes**: Project-specific automation with rich feedback
- **Thread Sharing**: Team knowledge captured in shareable conversations

## Quick Start

### 1. Setup Infrastructure

```bash
# Set toolbox environment variable (add to ~/.bashrc for persistence)
export AMP_TOOLBOX="$HOME/.config/amp/toolbox"

# Make sure toolboxes are executable
chmod +x $AMP_TOOLBOX/*
```

**Note**: Always use `$AMP_TOOLBOX` environment variable instead of hardcoded paths.

### 2. Verify Setup

```bash
# Test toolboxes
TOOLBOX_ACTION=describe $AMP_TOOLBOX/validate-architecture
TOOLBOX_ACTION=describe $AMP_TOOLBOX/oracle-review

# Test commands
./.agents/commands/architecture-review
./.agents/commands/debug-with-research
./.agents/commands/capture-knowledge
```

## 🔍 ChunkHound Research Protocol

**MANDATORY: Use ChunkHound for ALL research tasks before making any code changes.**

### Available ChunkHound Tools
- `mcp__chunkhound__search_semantic` — Natural language discovery across files
- `mcp__chunkhound__search_regex` — Exact text/pattern lookups
- `tb__chunkhound_search_semantic` — Alternative semantic search
- `tb__chunkhound_search_regex` — Alternative regex search
- `mcp__chunkhound__get_stats` — Repository statistics
- `mcp__chunkhound__health_check` — System health check

### When to Use ChunkHound
- **BEFORE ANY CODE CHANGES**: Research existing implementations and patterns
- **Debugging**: Find related code and understand data flow
- **Architecture Analysis**: Map component relationships and dependencies
- **Pattern Discovery**: Identify existing solutions and conventions

### Usage Guidelines

**Step 1: Semantic Search First**
```
Use mcp__chunkhound__search_semantic with natural language queries:
- "where do we handle LLM provider switching?"
- "how is the selector registry implemented?"
- "what caching patterns are used in the pipeline?"
```

**Step 2: Refine with Regex**
```
Use mcp__chunkhound__search_regex for specific patterns:
- LLM_PROVIDER, data-testid, yarn spec:
- class.*Service, interface.*Provider
```

**NEVER make changes without ChunkHound research first!**

## Core Components

### Intelligent Context System

#### Root AGENTS.md
The main guidance file at `AGENTS.md` provides project overview and quick references. It includes:
- Project architecture and tech stack
- Build/test commands
- When to use Oracle vs Librarian
- Links to granular guidance

#### Granular Guidance Files
Located in `docs/development/` with glob patterns for auto-activation:
- `testing.md` - BDD testing and LLM integration
- `playwright.md` - Playwright selectors and step implementations
- `scripts.md` - Pipeline automation and CLI tools
- `ci.md` - CI/CD integration and validation

### Advanced Toolboxes

Project-specific automation tools in `$AMP_TOOLBOX`:

#### validate-architecture
Validates BDD framework architecture and provides actionable feedback.

```bash
# Describe what it does
TOOLBOX_ACTION=describe $AMP_TOOLBOX/validate-architecture

# Execute validation
echo "dir: /home/benji822/Documents/personal/llm-bdd-test-framework" | TOOLBOX_ACTION=execute $AMP_TOOLBOX/validate-architecture
```

#### oracle-review
Triggers structured Oracle reviews of code changes.

```bash
# Describe parameters
TOOLBOX_ACTION=describe $AMP_TOOLBOX/oracle-review

# Review staged changes focusing on architecture
echo -e "scope: staged\nfocus: architecture" | TOOLBOX_ACTION=execute $AMP_TOOLBOX/oracle-review
```

### Custom Commands

Orchestrating workflows in `.agents/commands/`:

#### architecture-review
Comprehensive architecture review using Oracle.

```bash
./.agents/commands/architecture-review
```

#### debug-with-research
Debug issues using Oracle analysis + Librarian research.

```bash
./.agents/commands/debug-with-research
```

#### capture-knowledge
Document solutions and share team knowledge.

```bash
./.agents/commands/capture-knowledge
```

## Workflows

### Architecture Review Workflow

1. **Initial Analysis** (Main Agent)
   - Gather relevant files
   - Identify key components

2. **Deep Review** (Oracle)
   ```
   Use Oracle to review this BDD testing framework architecture. Focus on:
   - Pipeline design and stage separation
   - LLM integration and caching effectiveness
   - Error handling and maintainability
   ```

3. **Recommendations** (Oracle + Main Agent)
   - Implement suggested improvements
   - Test changes

### Debug with Research Workflow

1. **Problem Analysis** (Oracle)
   ```
   Use Oracle to analyze this debugging issue:
   - Problem description and symptoms
   - Affected files and recent changes
   ```

2. **External Research** (Librarian)
   ```
   Use Librarian to research similar issues in:
   - LLM provider SDKs (OpenAI, Anthropic)
   - Testing frameworks (Playwright, Cucumber)
   ```

3. **Solution Implementation** (Main Agent)
   - Apply findings
   - Test and validate

### Knowledge Capture Workflow

1. **Document Solution**
   - Create `docs/knowledge/[topic]-[timestamp].md`
   - Include problem, solution, and prevention

2. **Share Knowledge**
   - Set thread to "Workspace-shared"
   - Share in team communication channels

## Oracle Usage Patterns

### When to Use Oracle

✅ **Architecture Decisions**: Designing new features or refactoring existing code
✅ **Complex Debugging**: Issues involving LLM integration or pipeline failures
✅ **Performance Analysis**: Identifying bottlenecks in the testing pipeline
✅ **Code Reviews**: Reviewing changes for security, performance, and maintainability

### Good Oracle Prompts

```
Use Oracle to review this authentication system design:
- Files: auth/service.ts, auth/middleware.ts
- Requirements: JWT-based, refresh tokens, role-based access
- Concerns: Security, scalability, maintainability
```

```
Ask Oracle to debug this LLM provider switching issue:
- Error: Provider initialization failed
- Context: Switching from Codex to Claude
- Files: llm/providers/*.ts
- Recent changes: Updated API keys
```

### Oracle Response Expectations

Oracle should provide:
- Specific file names and line numbers
- Concrete code examples for improvements
- Effort estimates for implementation
- Risk assessments for changes

## Librarian Usage Patterns

### When to Use Librarian

✅ **Framework Documentation**: Finding API references and examples
✅ **Cross-Repository Research**: Learning from other teams' implementations
✅ **Best Practices**: Discovering established patterns and conventions
✅ **Debugging External Issues**: Researching known bugs in dependencies

### Good Librarian Prompts

```
Ask Librarian to search the Playwright repo for:
- Selector stability patterns
- Anti-flakiness techniques
- Accessibility testing approaches
```

```
Use Librarian to research how other BDD frameworks handle:
- LLM provider caching
- Parallel test execution
- Schema validation patterns
```

### Librarian Response Expectations

Librarian should provide:
- Specific repository links and file paths
- Code examples from real projects
- Alternative approaches and trade-offs
- Migration guides when applicable

## Best Practices

### ChunkHound Best Practices

**ALWAYS use ChunkHound before making changes:**
- Start with semantic search for broad understanding
- Use regex search for specific patterns
- Document findings before implementing
- Cross-reference multiple search results

**Example Workflow:**
1. "Use mcp__chunkhound__search_semantic to understand how we handle LLM providers"
2. "Use mcp__chunkhound__search_regex to find all LLM_PROVIDER usages"
3. Review findings and plan changes
4. Only then implement modifications

### Oracle Best Practices

**DO:**
- ✅ Provide context (files, errors, requirements)
- ✅ Be specific about what Oracle should analyze
- ✅ Include expected vs actual behavior
- ✅ Ask for concrete examples and line numbers

**DON'T:**
- ❌ Use Oracle for simple code edits
- ❌ Expect Oracle to read your mind
- ❌ Use Oracle for every single task (cost/time)

### Librarian Best Practices

**DO:**
- ✅ Specify which repositories to search
- ✅ Include technical terms and patterns
- ✅ Focus on specific technologies/frameworks
- ✅ Combine with Oracle for comprehensive analysis

**DON'T:**
- ❌ Ask vague questions
- ❌ Expect Librarian to know private repo details
- ❌ Use Librarian for your own codebase (use grep/Amp search)

### Workflow Best Practices

**Knowledge Sharing:**
- Always use `capture-knowledge` after solving complex issues
- Set threads to "Workspace-shared" for team visibility
- Update AGENTS.md when discovering new patterns

**Quality Assurance:**
- Run `validate-architecture` before major changes
- Use Oracle for architecture reviews
- Commit generated artifacts for deterministic CI

## Troubleshooting

### Toolboxes Not Found

```bash
# Check environment variable
echo $AMP_TOOLBOX

# Verify toolboxes exist and are executable
ls -la $AMP_TOOLBOX/
```

### Commands Not Executing

```bash
# Check permissions
ls -la .agents/commands/

# Make executable if needed
chmod +x .agents/commands/*
```

### Oracle/Librarian Not Responding

- Verify Amp is properly configured
- Check network connectivity
- Try simpler prompts first
- Use specific file paths and context

## Migration from Other Tools

### From Claude Code

**Skills → Granular Guidance**
- Convert each Claude Code skill to a guidance file
- Add Oracle/Librarian integration
- Include glob patterns for auto-activation

**Hooks → Toolboxes**
- Transform validation hooks into rich feedback toolboxes
- Add Oracle invocation for complex cases
- Provide actionable suggestions with examples

**Agents → Commands**
- Convert specialized agents into orchestrating commands
- Add multi-step workflows with Oracle/Librarian
- Focus on knowledge capture and sharing

## Measuring Success

### Adoption Metrics
- % of team using Oracle regularly
- % of team using Librarian for research
- Number of shared threads per week
- Number of knowledge docs created

### Quality Metrics
- Architecture issues caught by Oracle
- Bugs prevented by validation toolboxes
- Time saved by Librarian research
- Code review quality improvements

### Knowledge Metrics
- Knowledge docs created
- Thread shares per month
- AGENTS.md updates
- Team guidance additions

## Team Adoption Checklist

### For Each Team Member

- [ ] Install Amp and configure workspace
- [ ] Set up `$AMP_TOOLBOX` environment variable
- [ ] Clone project and verify AGENTS.md is present
- [ ] **Learn ChunkHound**: Use mcp__chunkhound__search_semantic for "how does the BDD pipeline work?"
- [ ] **Practice ChunkHound**: Use mcp__chunkhound__search_regex to find "LLM_PROVIDER" usage
- [ ] Test Oracle: "Use Oracle to review [something]"
- [ ] Test Librarian: "Ask Librarian about [framework]"
- [ ] Test custom commands (Ctrl-O or Cmd-Shift-A)
- [ ] Review shared threads from team
- [ ] Create first knowledge-capture thread

### Team Workflows

**Code Reviews:**
1. Use `architecture-review` command
2. Oracle reviews changes
3. Share thread with reviewer
4. Discuss Oracle's findings
5. Capture decisions in knowledge base

**Debugging Sessions:**
1. Use `debug-with-research` command
2. Oracle analyzes, Librarian researches
3. Share thread with team
4. Document solution
5. Update AGENTS.md if pattern emerges

## Advanced Patterns

### Oracle + Librarian Combination

**Research → Plan → Implement:**

1. **Research (Librarian)**: Gather external knowledge
2. **Plan (Oracle)**: Design solution using research findings
3. **Implement (Main Agent)**: Code the solution
4. **Review (Oracle)**: Validate implementation

### Multi-Step Commands

Custom commands can orchestrate complex workflows:
- Gather context automatically
- Invoke Oracle with structured prompts
- Process results and provide next steps
- Capture knowledge for future reference

### Thread-Based Learning

- Solve problems using Oracle/Librarian
- Share threads with team for collective learning
- Build knowledge base organically
- Evolve AGENTS.md based on team learnings

## Conclusion

This Amp-native infrastructure transforms development from individual coding to intelligent collaboration. By leveraging Oracle's reasoning, Librarian's research, and thread-based knowledge sharing, teams can build better software faster while continuously learning and improving.

**Start small**: Begin with Oracle for architecture reviews and Librarian for framework research. Gradually adopt toolboxes and custom commands as you discover patterns in your workflow.

**Remember**: This is Amp-first design—embrace Amp's unique capabilities rather than replicating other tools. The infrastructure will evolve organically as your team discovers new patterns and best practices.
