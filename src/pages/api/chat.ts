import type { NextApiRequest, NextApiResponse } from 'next'
import { PineconeClient } from "@pinecone-database/pinecone";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import * as Ably from 'ably'
import { uuid } from 'uuidv4';
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ConversationLog } from "./conversationLog";
import { ChatOpenAI } from "langchain/chat_models/openai";

let client: PineconeClient | null = null

const PINECONE_NAME_SPACE = 'mentalHealth-help'; //namespace is optional for your vectors

type PageSource = {
    pageContent: string,
    metadata: {
        url: string
    }
}

const initPineconeClient = async () => {
    client = new PineconeClient()
    await client.init({
        environment: process.env.PINECONE_ENVIRONMENT!,
        apiKey: process.env.PINECONE_API_KEY!
    })
}

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY})
const CONDENSE_PROMPT = `Given the following conversation and a answer, rephrase the answer to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone question:`;

const QA_PROMPT = `I'm a person seeking mental health support. I'd like you to help me think through problems in my life and help find solutions to my problem.

Always end your response to me with a question that will help me dive deeper in my inner work.

Chat History:
{chat_history}

answer: {question}
Next question:`;

const handleRequest = async ({ history, prompt, userId, source, streaming }: { history:[] ,prompt: string, userId: string, source: boolean, streaming: boolean }) => {
   if(!client) {
    await initPineconeClient()
   }

   try {
     const channel = ably.channels.get(userId)
     const interactionId = uuid()

    //  const conversationLog = new ConversationLog(userId)
    //  const conversationHistory = await conversationLog.getConverstion({ limit: 10})
    //  await conversationLog.addEntry({ entry: prompt, speaker: "user"})

     const pineconeIndex = client!.Index(process.env.PINECONE_INDEX!)
     
     channel.publish({
        data: {
            event: "status",
            message: "Finding matches..."
        }
     })

     const vectorStore = await PineconeStore.fromExistingIndex(
        new OpenAIEmbeddings(),
        { 
            pineconeIndex,
            textKey: 'text',
            namespace: PINECONE_NAME_SPACE,
        }
     )

     const model = new ChatOpenAI({
         temperature: 0,
         streaming,
         modelName: 'gpt-3.5-turbo', //change this to gpt-4 if you have access
         callbacks: [{
            async handleLLMNewToken(token) {
                channel.publish({
                    data: {
                        event: "response",
                        token,
                        interactionId 
                    }
                })
            },
            async handleLLMEnd() {
                channel.publish({
                    data: {
                        event: "responseEnd"
                    }
                })
            }
        }]         
    })
   
     const nonStreamingModel = new ChatOpenAI({
        temperature: 0,
        modelName: 'gpt-3.5-turbo', //change this to gpt-4 if you have access
     })

     const chain = ConversationalRetrievalQAChain.fromLLM(
        model,
        vectorStore.asRetriever(),
        { 
            qaTemplate: QA_PROMPT,
            // questionGeneratorTemplate: CONDENSE_PROMPT,
            returnSourceDocuments: true,
            questionGeneratorChainOptions: {
                llm: nonStreamingModel
            }        
        }
     )

    //  let chat_history =  conversationHistory.join("\n")
    let chat_history = history;
    console.log(chat_history,"chat_history")
     const response = await chain.call({ question: prompt, chat_history })

     if(!streaming) {
        channel.publish({
            data: {
                event: "response",
                token: response.text,
                interactionId 
            }
        })
     }

     if(source) {
        const pageContents: string[] = []

        let index = 1
        response.sourceDocuments.forEach((source: PageSource) => {
            const { pageContent, metadata: { url }} = source
        
            if(!pageContents.includes(pageContent)){
                const token = `<br/><b>Source #${index}</b>
                                    <br/>${pageContent}
                                    <br/><a href="${url}" target="_blank">${url}</a>` 
            
                channel.publish({
                    data: {
                        event: "response",
                        token: "<br/>" + token,
                        interactionId 
                    }
                })
            
                pageContents.push(pageContent)
                index++
            }
        });
    }

    //  await conversationLog.addEntry({ entry: response.text, speaker: "bot" })

    } catch(error) { 
       console.error(error)
   }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const {  body: { history, prompt, userId, source, streaming } } = req
    await handleRequest({ history, prompt, userId, source, streaming})
    res.status(200).json({ "message": "started" })
}