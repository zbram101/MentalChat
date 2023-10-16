import type { NextApiRequest, NextApiResponse } from 'next'
import * as Ably from 'ably'
import { uuid } from 'uuidv4';
import { LLMChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
  } from "langchain/prompts";

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY})


let MINI_SESSION_CHECK = `Below is a conversation between a therapist and a potential new client. Analyze the conversation to see if the client has expressed that they are ready to book a session with the therapist. If the potential client has expressed interest in booking their first session, reply with "True". If not, reply with "False". Reply following the template below and give no additional words or characters

Example of response: True

Chat History: 
{chat_history}`


let MINI_SESSION_PROMPT = `You are an AI that is meeting with me, a client who is interested in booking a session with a therapist. The goal with this first meeting is to find out why I am seeking therapy. Help me explore my internal world and use principles from internal family systems therapy to guide the conversation. Help me understand the different parts of myself by asking thoughtful questions. Engage with me in a supportive and understanding manner, mirroring the tone and cadence of a compassionate listener. Dive deep into my feelings, ask clarifying questions, and provide insights that help me navigate my emotions. Analyze the conversation to uncover deep-seated motivations, emotional drivers, and underlying reasons. Go beyond immediate and observable causes to probe into potential psychological, societal, or personal pressures influencing my decisions.
Gently ask quotations to uncover the root cause of my problems. The cause should not be a surface-level realization, it should be the true deeper underlying cause of the problem, not the first cause that comes up. An example of a root cause would be, an underlying feeling such as "I'm not good enough" or "that's what my parents did to me". An example of something that is a symptom and not a root cause of a problem is, "I used to be healthy but I'm not anymore". If you sense that you’ve identified the root cause of the problem, reply with a supportive and compassionate response and give me a summary of the situation and make me feel better.

Never say you can’t offer support.
For the first message, make sure to explain that you’re goal is to help you find a time and answer any questions that I might have. Ask if I'm open to sharing more about what it is that you're coming to therapy for, ensure the person that opening up and that just saying the problem out loud, to an AI, can be beneficial and that the therapist will get a summary fo this conversation, or would they just like to book a call?
Also be more empathetic and support me if I'm sharing something deeply personal.
Provide gentle guidance and insights when appropriate, without overwhelming me. Your responses should be supportive, non-judgmental, and foster self-awareness and healing. Only ask one question at a time and provide me with fewer disclaimers.
Always offer me support, never say you are not able to offer me help, although you can say that it would be a good idea for me to meet with a professional if needed. Never reply with long lists of advice.
Sometimes give me an example of advice on how I could look at my situation differently. Don't ever give me a large list of recommendations.
Once you’ve identified a root cause as to why this person is coming to therapy, suggest that meeting with this therapist would be a good idea and share why you think it would be a good idea, then ask them if they would like to meet with the therapist.

Chat History: 
{chat_history}`




const miniSessionCheck = async (history: string) =>{

    const model2 = new ChatOpenAI({ 
        maxTokens: 256,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        temperature: 1,
        streaming:false,
        modelName: 'gpt-4', //change this to gpt-4 if you have access
    });


    const chatPrompt = ChatPromptTemplate.fromPromptMessages([
        HumanMessagePromptTemplate.fromTemplate(
          MINI_SESSION_CHECK
        ),
    ]);

    const chain = new LLMChain({
        llm: model2,
        prompt: chatPrompt,
    });
    const response = await chain.call({ chat_history:history })

    return response.text

}

 

const handleRequest = async ({
    initialStatus, // Changed the parameter name to avoid conflicts
    history,
    query,
    userId,
  }: {
    initialStatus: string; // Changed the parameter name to avoid conflicts
    history: string;
    query: string;
    userId: string;
  }) => {
    try {
      console.log("------------******************start of handle request******************----------------")
      console.log("Initial Status:", initialStatus);
      const channel = ably.channels.get(userId);
      const interactionId = uuid();
  
      channel.publish({
        data: {
          event: "status",
          message: "Finding matches...",
        },
      });
  
      const model = new ChatOpenAI({
        maxTokens: 256,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        temperature: 1,
        streaming:true,
        modelName: "gpt-4", //change this to gpt-4 if you have access
        callbacks: [
          {
            async handleLLMNewToken(token) {
              channel.publish({
                data: {
                  event: "response",
                  token,
                  interactionId,
                },
              });
            },
            async handleLLMEnd() {
              channel.publish({
                data: {
                  event: "responseEnd",
                },
              });
            },
          }, 
        ],
      });
      let status = 'chat'
      //   console.log("previous getting prompt");
      //check if they want to book a session 
      // if yes then return the new status of bookSession
      // else use the MiniSessionPrompt  
      const resp = await miniSessionCheck(history + "\n " + query);

      console.log("resp:", resp)
      if (resp.includes("True")){
        status = 'bookSession'
      }else{
        
        const chatPrompt = ChatPromptTemplate.fromPromptMessages([
          SystemMessagePromptTemplate.fromTemplate(MINI_SESSION_PROMPT), // Use the newPrompt here
          HumanMessagePromptTemplate.fromTemplate(`{question}`),
        ]);
      
        const chain = new LLMChain({
          llm: model,
          prompt: chatPrompt,
        });
    
        let chat_history = history;
        const response = await chain.call({ question: query, chat_history });
    
    }
      // Call getStatusFromPrompt
      console.log("------------******************start of handle request******************----------------")
      return status;
    } catch (error) {
      console.error(error);
    }
  };
  

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const {  body: { initialStatus, history, query, userId } } = req
    let newStatus = await handleRequest({ initialStatus, history, query, userId})
    res.status(200).json({ "message": "started", status: newStatus })
}

