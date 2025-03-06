import { ChatOllama } from "@langchain/ollama"
import { z } from "zod"
import { tool } from "@langchain/core/tools"


const llm = new ChatOllama({
    model: 'qwen2.5:0.5b',
    baseUrl: "http://localhost:11434",
    temperature: 0.0, 
})

const calculationSchema = z.object({
    a: z.number().describe("first number"),
    b: z.number().describe("second number"),
})

const additionTool = tool(
    async ({ a, b }) => {
      return a + b
    },
    {
      name: "addition",
      description: "Add numbers.",
      schema: calculationSchema,
    }
)

const multiplicationTool = tool(
  async ({ a, b }) => {
    return a * b
  },
  {
    name: "multiplication",
    description: "Multiply numbers.",
    schema: calculationSchema,
  }
)

const llmWithTools = llm.bindTools([
  additionTool,
  multiplicationTool
])

let toolMapping = {
    "addition": additionTool,
    "multiplication": multiplicationTool
}

let llmOutput = await llmWithTools.invoke("Add 30 and 12. Then multiply 21 by 2.")

// Detected tools
for (let toolCall of llmOutput.tool_calls) {
    console.log("🛠️ Tool:", toolCall.name, "Args:", toolCall.args)
}

// Invoke the tools
for (let toolCall of llmOutput.tool_calls) {
    let functionToCall = toolMapping[toolCall.name]
    let result = await functionToCall.invoke(toolCall.args)
    console.log("🤖 Result for:", toolCall.name, "with:", toolCall.args, "=", result)
}

