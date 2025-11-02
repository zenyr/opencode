import { describe, expect, test } from "bun:test"
import path from "path"
import { BashTool } from "../../src/tool/bash"
import { Instance } from "../../src/project/instance"

const ctx = {
  sessionID: "test",
  messageID: "",
  toolCallID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  metadata: () => {},
}

const bash = await BashTool.init()
const projectRoot = path.join(__dirname, "../..")

describe("tool.bash", () => {
  test("basic", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const result = await bash.execute(
          {
            command: "echo 'test'",
            description: "Echo test message",
          },
          ctx,
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.metadata.output).toContain("test")
      },
    })
  })

  test("cd ../ should fail outside of project root", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        expect(
          bash.execute(
            {
              command: "cd ../",
              description: "Try to cd to parent directory",
            },
            ctx,
          ),
        ).rejects.toThrow("This command references paths outside of")
      },
    })
  })

  test("output with special characters should be handled", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const result = await bash.execute(
          {
            command: 'echo "test with \\"quotes\\" and newlines\nline2"',
            description: "Echo message with special characters",
          },
          ctx,
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.output).toContain("test with")
        expect(result.output).toContain("quotes")
        expect(result.output).toContain("newlines")
      },
    })
  })
})
