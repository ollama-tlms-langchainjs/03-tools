# Using "tools" support (or function calling) with LangchainJS and Ollama

## Tools? Function calling?

Some LLMs offer **tools** support, which allows for **function calling**. But let's be clear: an LLM is not capable of executing a function. **Tools** support means that if you provide an LLM with a formatted list of tools (like the one below), the LLM will be able to identify the appropriate tool and the arguments to provide to the tool when you ask a question like **`add 5 and 40`**.

So from this list:

```json
[
    {
        "type": "function", 
        "function": {
            "name": "hello",
            "description": "Say hello to a given person with his name",
            "parameters": {
                "type": "object", 
                "properties": {
                    "name": {
                        "type": "string", 
                        "description": "The name of the person"
                    }
                }, 
                "required": ["name"]
            }
        }
    },
    {
        "type": "function", 
        "function": {
            "name": "addNumbers",
            "description": "Make an addition of the two given numbers",
            "parameters": {
                "type": "object", 
                "properties": {
                    "a": {
                        "type": "number", 
                        "description": "first operand"
                    },
                    "b": {
                        "type": "number",
                        "description": "second operand"
                    }
                }, 
                "required": ["a", "b"]
            }
        }
    }
]
```

And with the question **`add 2 and 40`**, you will get a response like this (a **"tool call"**):

```json
[{"name":"addNumbers","arguments":{"a":2,"b":40}}]
```

And if there are multiple references to tools in the same question, the LLM will return multiple **"tool calls"**. For example, with the question **`Say hello to Bob and add 2 and 4`**, you will get:

```json
[
    {"name":"hello","arguments":{"name":"Bob"}},
    {"name":"addNumbers","arguments":{"a":2,"b":40}}
]
```

**And it won't go any further!** It's up to you to implement the `hello` and `addNumbers` functions.

**Some references on the subject**:

- A blog post: https://ollama.com/blog/tool-support
- A video from the excellent [Matt William](https://bsky.app/profile/technovangelist.bsky.social): [Function Calling in Ollama vs OpenAI](https://www.youtube.com/watch?v=RXDWkiuXtG0)

Of course, LangchainJS provides helpers to facilitate the use of tools support. Let's see how to use them.

## LangchainJS and tools support (with Ollama)

**Objective**: perform addition and multiplication.

First, create a new project in a directory with the following `package.json` file:

```json
{
  "name": "function-calling",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "dependencies": {
    "@langchain/ollama": "^0.2.0",
    "dotenv": "^16.4.7",
    "langchain": "^0.3.15",
    "zod": "^3.24.1"
  }
}
```
And install the dependencies with the `npm install` command.

Then create an `index.js` file with the following imports:

```javascript
import { ChatOllama } from "@langchain/ollama"
import { z } from "zod"
import { tool } from "@langchain/core/tools"
```
> **Zod?**: Zod is a JavaScript/TypeScript schema validation library that focuses on runtime type checking. It allows you to define schemas for your data and validate that the data matches these schemas.

Now, let's instantiate a chat model:

```javascript
const llm = new ChatOllama({
    model: 'qwen2.5:0.5b',
    baseUrl: "http://localhost:11434",
    temperature: 0.0, 
})
```
> **Note**: you need to choose an LLM that offers tools support. You can search for them with this link on the Ollama website: https://ollama.com/search?c=tools

### Temperature

It is very important to set the temperature to `0.0` for the model to work correctly, for several important reasons:

1. **Determinism**: with a temperature of `0.0`, the model will always produce the same output for a given input. This makes the behavior of function calling predictable and reliable.
2. **Structure**: the LLM must generate JSON structures that must be syntactically correct. We must therefore avoid variability.
3. **Parameter accuracy**: the LLM must accurately extract parameters from the user's request, thus the arguments for the function to call.

### The tools

Now, we will define the **tools** and directly associate them with the functions to call.

#### Arguments schema

Our addition and our multiplication both expect two arguments (two operands). A **tool** in LangchainJS needs a schema describing these two arguments. We will use the same for both operations:

```javascript
const calculationSchema = z.object({
    a: z.number().describe("first number"),
    b: z.number().describe("second number"),
})
```

#### DynamicStructuredTool & bindTools

LangchainJS provides a structure to define a **tool**: the **`[DynamicStructuredTool](https://v03.api.js.langchain.com/classes/langchain.tools.DynamicStructuredTool.html)`** and a helper **`tool()`** to create such a structure.

So let's use it to create our addition and multiplication:

```javascript
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
```

As you can see, it's rather simple. Now we need to "bind" the **tools** to the chat model (`llm`) with the `bindTools` method:

```javascript
const llmWithTools = llm.bindTools([
  additionTool,
  multiplicationTool
])
```

So we have "transformed" `llm` into a new chat model (`llmWithTools`) to which we have "grafted" the list of tools (which will allow the LLM to refer to them to recognize and extract **tools** and **arguments**). Then, we need to create a "mapping" that will help us invoke the functions:

```javascript
let toolMapping = {
    "addition": additionTool,
    "multiplication": multiplicationTool
}
```

That's it, we are ready to do **"function calling"**, so to ask our LLM to recognize **tools** so that our generative AI application can execute them.

### Prompt and Function Invocation

We can therefore "send" our requests to the LLM with the code below:

```javascript
let llmOutput = await llmWithTools.invoke("Add 30 and 12. Then multiply 21 by 2.")
```

And use the response to list the detected **tools**:

```javascript
// Detected tools
for (let toolCall of llmOutput.tool_calls) {
    console.log("🛠️ Tool:", toolCall.name, "Args:", toolCall.args)
}
```

You will get this:
```bash
🛠️ Tool: addition Args: { a: 30, b: 12 }
🛠️ Tool: multiplication Args: { a: 21, b: 2 }
```

And now to execute the operations, use the following code:
```javascript
// Invoke the tools
for (let toolCall of llmOutput.tool_calls) {
    let functionToCall = toolMapping[toolCall.name]
    let result = await functionToCall.invoke(toolCall.args)
    console.log("🤖 Result for:", toolCall.name, "with:", toolCall.args, "=", result)
}
```

You will get this:
```bash
🤖 Result for: addition with: { a: 30, b: 12 } = 42
🤖 Result for: multiplication with: { a: 21, b: 2 } = 42
```

And there you have it! Once again, LangchainJS provides the necessary elements to simplify our lives. In a future article, we will see how to use the concept of **tools** with the **"Model Context Protocol"**.

> If you want to know more about **MCP**, you can read:
>
> - [Understanding the Model Context Protocol](https://k33g.hashnode.dev/understanding-the-model-context-protocol-mcp)
> - [WASImancer, an MCP server with SSE transport, powered by WebAssembly](https://k33g.hashnode.dev/wasimancer-an-mcp-server-with-sse-transport-powered-by-webassembly)

You can find the code for this article here: https://github.com/ollama-tlms-langchainjs/03-tools

See you soon.
