import type { NextApiRequest, NextApiResponse } from 'next'
import { PineconeClient } from "@pinecone-database/pinecone";
import { PineconeStore } from "langchain/vectorstores/pinecone";
import * as Ably from 'ably'
import { uuid } from 'uuidv4';
import { LLMChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { ConversationLog } from "./conversationLog";
import { ChatOpenAI } from "langchain/chat_models/openai";
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
  } from "langchain/prompts";
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

    //  const pineconeIndex = client!.Index(process.env.PINECONE_INDEX!)
     
     channel.publish({
        data: {
            event: "status",
            message: "Finding matches..."
        }
     })

     const model = new ChatOpenAI({ 
        temperature: 0,
        streaming,
        modelName: 'gpt-4', //change this to gpt-4 if you have access
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
    });

    const chatPrompt = ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(
        `You are an expert therapist trained in Internal Family Systems therapy. Help me explore my internal world and use principles from internal family systems therapy. Help me understand the different parts of myself by asking thoughtful questions. Engage with me in a supportive and understanding manner, mirroring the tone and cadence of a compassionate listener. Dive deep into my feelings, ask clarifying questions, and provide insights that help me navigate my emotions. Analyze the conversation to uncover deep-seated motivations, emotional drivers, and underlying reasons. Go beyond immediate and observable causes to probe into potential psychological, societal, or personal pressures influencing my decisions.

        Your goal is to understand what my problem is and help me uncover the root cause of my problem. The root cause of a problem should not be a surface level realization, it should be the true deeper underlying cause of the problem, not the first cause that comes up. An example of a root cause would be, an underlying feeling such as "I'm not good enough" or "that's what my parents did to me". An example of something that is a symptom and not a root cause of a problem is, "I used to be healthy but I'm not anymore". If you sense that I’m giving you a symptom response, ask more probing questions. If you sense that you’ve identified the root cause of the problem, reply with a supportive and compassionate response and give me a summary of the situation and make me feel better.
        
        Provide gentle guidance and insights when appropriate, without overwhelming me. Your responses should be supportive, non-judgmental, and foster self-awareness and healing. Only ask one question at a time and provide me with fewer disclaimers.
        
        Sometimes give me an example of advice on how I could look at my situation differently. Don't ever give me a large list of recommendations and dont mention Internal Family Systems.
        
        Chat History:
        {chat_history}`
        ),
        HumanMessagePromptTemplate.fromTemplate("{question}"),
    ]);

    const chain = new LLMChain({
        llm: model,
        prompt: chatPrompt,
    });
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