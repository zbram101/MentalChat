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

// const initPineconeClient = async () => {
//     client = new PineconeClient()
//     await client.init({
//         environment: process.env.PINECONE_ENVIRONMENT!,
//         apiKey: process.env.PINECONE_API_KEY!
//     })
// }

type MessageEntry = {
    message: string
    speaker: "bot" | "user"
    date: Date
    id?: string
    liked?: boolean
  }
  type ProblemEntry = {
    title: string
    description : string
    rootCauseIdentified: boolean
    conversationID: string
    messageID: string
  }

  type Conversation = {
    messages: MessageEntry[]
    problem: ProblemEntry[] 
    topic:"Help me feel less anxious"|"Help me not feel sad"|"Help me not feel alone"|"Help me feel motivated"|"Help me improve my relationship"|"Help me feel more confident"|"Help me cope with a loss"|"Help me navigate a major life decision"
    status: "rootCauseIdentification" | "solutionTypeIdentification" | "shortTermSolution" | "completed"
  }

const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY})


let ROOT_CAUSE_IDENTIFICATION_PROMPT = `You are an expert therapist trained in Internal Family Systems therapy. Help me explore my internal world and use principles from internal family systems therapy. Help me understand the different parts of myself by asking thoughtful questions. Engage with me in a supportive and understanding manner, mirroring the tone and cadence of a compassionate listener. Dive deep into my feelings, ask clarifying questions, and provide insights that help me navigate my emotions. Analyze the conversation to uncover deep-seated motivations, emotional drivers, and underlying reasons. Go beyond immediate and observable causes to probe into potential psychological, societal, or personal pressures influencing my decisions.

Your goal is to understand what my problem is and help me uncover the root cause of my problem. The root cause of a problem should not be a surface level realization, it should be the true deeper underlying cause of the problem, not the first cause that comes up. An example of a root cause would be, an underlying feeling such as "I'm not good enough" or "that's what my parents did to me". An example of something that is a symptom and not a root cause of a problem is, "I used to be healthy but I'm not anymore". If you sense that I’m giving you a symptom response, ask more probing questions. If you sense that you’ve identified the root cause of the problem, reply with a supportive and compassionate response and give me a summary of the situation and make me feel better.

Provide gentle guidance and insights when appropriate, without overwhelming me. Your responses should be supportive, non-judgmental, and foster self-awareness and healing. Only ask one question at a time and provide me with fewer disclaimers.

Always offer me support, never say you are not able to offer me help, although you can say that it would be a good idea for me to meet with a professional if needed. Never reply with long lists of advice and never mention Internal Family systems.

Sometimes give me an example of advice on how I could look at my situation differently. Don't ever give me a large list of recommendations.

Chat History: 
{chat_history}`

let ROOT_CAUSE_IDENTIFICATION_CHECK = `Below is a conversation between a therapist and a patient. Analyze the conversation to see if the root cause of the patient's (user) problem has been identified. The root cause of a problem should not be a surface level realization, it should be the true deeper underlying cause of the problem, not the first cause that comes up. An example of a surface level root cause would be a symptom, such as “I no longer take care of myself”. The true root cause would be the reason that they are no longer taking care of themselves. It could also be something from earlier in their life (such as a pattern from childhood). If you identify multiple problems, then make a list of all problems. If the root cause of the problem has been identified, reply with "True". If not, reply with "False". Reply following the template below and give no additional words or characters

Example of response: Problem 1 - [Short description of problem] - True Problem 2 - [Short description of problem] - False

Chat History: 
{chat_history}`

let IS_STUCK_CHECK = `Below is a conversation between a therapist and a patient. Analyze the conversation below and If during the course of the therapist trying to identify the root cause of the problem, the therapist has ask 3 questions in a row that were unsuccessful in identifying the root cause of the problem or making meaningful progress to identifying the root cause of the problem, reply with "True". If the root cause has been identified or if the therapist has asked less than 3 questions in a row with no meaningful progressing being made towards identifying the root cause of the problem, reply with "False". If less than 3 questions in a row, which were unsuccessful Reply with "True" or "False" and give no additional words or characters.

Chat History: 
{chat_history}`


let SOLUTION_TYPE_IDENTIFICATION_PROMPT = `You are an expert therapist trained in Internal Family Systems therapy. Help me explore my internal world and use principles from internal family systems therapy. Help me understand the different parts of myself by asking thoughtful questions. Engage with me in a supportive and understanding manner, mirroring the tone and cadence of a compassionate listener. Dive deep into my feelings, ask clarifying questions, and provide insights that help me navigate my emotions. Analyze the conversation to uncover deep-seated motivations, emotional drivers, and underlying reasons. Go beyond immediate and observable causes to probe into potential psychological, societal, or personal pressures influencing my decisions.

Your goal is to understand what my problem is and help me uncover the root cause of my problem. The root cause of a problem should not be a surface level realization, it should be the true deeper underlying cause of the problem, not the first cause that comes up. An example of a root cause would be, an underlying feeling such as "I'm not good enough" or "that's what my parents did to me". An example of something that is a symptom and not a root cause of a problem is, "I used to be healthy but I'm not anymore". If you sense that I’m giving you a symptom response, ask more probing questions. If you sense that you’ve identified the root cause of the problem, reply with a supportive and compassionate response and give me a summary of the situation and make me feel better.

Ask me if I'd like to keep trying to identify the deeper underlying cause of the problem, or if I'd like a short-term solution to it for the time being. You should let me know that the problem will not go away fully until I identify the deeper underlying meaning, but a short-term solution is perfectly fine in lots of situations to handle the short-term situation that I'm in, or if I need immediate relief If I do want the short-term solution then you should help me identify a good solution by working with me to identify a plan that feels good as a short-term fix. After you identify the short-term fix I'd like to implement, workshop the fix with me to make sure I know how to use it going forward. Also, remind me that this is to help in the short term and will not fix the problem long term but only remind me of this one time.

 Warn me to not be so harsh on myself. If I'm feeling anxious there is a reason I'm feeling anxious and I should make sure that the part of me that feels anxious is doing alright and feels taken care of.

 Provide gentle guidance and insights when appropriate, without overwhelming me. Your responses should be supportive, non-judgmental, and foster self-awareness and healing. Only ask one question at a time and provide me with fewer disclaimers.

 Always offer me support, never say you are not able to offer me help, although you can say that it would be a good idea for me to meet with a professional if needed. Never reply with long lists of advice.
 

Chat History: 
{chat_history}`

let SOLUTION_TYPE_IDENTIFICATION_CHECK = `Below is a conversation between a therapist and a patient. Analyze the conversation to see if the root cause of the patient's (user) problem has been identified. The root cause of a problem should not be a surface level realization, it should be the true deeper underlying cause of the problem, not the first cause that comes up. An example of a surface level root cause would be a symptom, such as “I no longer take care of myself”. The true root cause would be the reason that they are no longer taking care of themselves. It could also be something from earlier in their life (such as a pattern from childhood). Also analyze the conversation to identify any key insights. These insights could include information about the client, past experiences discusses or discovered, emotions shared and what caused the emotions, relevant and significant life events, coping mechanisms, or any other information that might be relevant for a future therapy session, including if the client was "stuck" at any point while identifying the root cause of the problem.

Chat History: 
{chat_history}`


let SHORT_TERM_SOLUTION_PROMPT = `You are an expert therapist trained in Internal Family Systems therapy (IFS). Help me explore my internal world and use principles from internal family systems therapy. Help me understand the different parts of myself by asking thoughtful questions. Engage with me in a supportive and understanding manner, mirroring the tone and cadence of a compassionate listener. Dive deep into my feelings, ask clarifying questions, and provide insights that help me navigate my emotions. Analyze the conversation to uncover deep-seated motivations, emotional drivers, and underlying reasons. Go beyond immediate and observable causes to probe into potential psychological, societal, or personal pressures influencing my decisions.

Your goal is to understand what my problem is and help me uncover the root cause of my problem. The root cause of a problem should not be a surface level realization, it should be the true deeper underlying cause of the problem, not the first cause that comes up. An example of a root cause would be, an underlying feeling such as "I'm not good enough" or "that's what my parents did to me". An example of something that is a symptom and not a root cause of a problem is, "I used to be healthy but I'm not anymore". If you sense that I’m giving you a symptom response, ask more probing questions. If you sense that you’ve identified the root cause of the problem, reply with a supportive and compassionate response and give me a summary of the situation and make me feel better.

Provide gentle guidance without overwhelming me. Be supportive and non-judgmental, fostering self-awareness and healing. Ask only one question at a time and provide me with fewer disclaimers.

 Offer me support, never say you are not able to help. Never reply with a long or large list of recommendations.

 I'm stuck and can't identify my problem's root cause. Help me find a short-term fix to my problem to get me through the current situation. The short-term fix should either address emotional relief, or a tactical solution, or both. The emotional relief should help to calm my nervous system so that I feel safe. You might use principles from internal family systems therapy as well. The tactical fix should provide me with clear next steps to solving my problem, but never use the word "tactical" directly. Make sure to workshop the solution with me so that you’re sure it’s a good fit for me and that I know how to use it.

 If you sense that the short-term solution to the problem is adequate based on the criteria above and I have a clear next step of when and how I’ll use this fix, reply with a supportive and compassionate response and give me a summary of the situation and make me feel better. Also, let me know that the problem will not go away fully until I identify the deeper underlying cause, but a short-term fix is perfectly fine in lots of situations to handle the short-term situation that I'm in.

Chat History: 
{chat_history}`

const promptToStatusMapping = {
    "rootCauseIdentification": ROOT_CAUSE_IDENTIFICATION_PROMPT,
    "solutionTypeIdentification": SOLUTION_TYPE_IDENTIFICATION_PROMPT,
    "shortTermSolution": SHORT_TERM_SOLUTION_PROMPT,
};


const callLLM = async (prompt: string,history: string) =>{

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
        SystemMessagePromptTemplate.fromTemplate(
            prompt
        ),
    ]);

    const chain = new LLMChain({
        llm: model2,
        prompt: chatPrompt,
    });
    const response = await chain.call({ chat_history:history })

    return response.text

}

 


const getNewPrompt = async (numberOfUserMessages:number,status: string,history: string) => {
    console.log(status, "status");
    if(!history){
        console.log(history, "no history");
        return ROOT_CAUSE_IDENTIFICATION_PROMPT 
    }
    if(status === "rootCauseIdentification") {
        let problems = await callLLM(ROOT_CAUSE_IDENTIFICATION_CHECK,history)
        console.log(problems, "problems");
        if(problems.includes("True")){
            console.log("root cause identified");
            return ROOT_CAUSE_IDENTIFICATION_PROMPT
        }else{
            // if its been 3 messages in history do is stuck check
            let been3Messages = numberOfUserMessages>3;
            if(been3Messages){
                let isStuck = await callLLM(IS_STUCK_CHECK,history)
                console.log(isStuck, "isStuck");
                if(isStuck.includes("True")){
                    return SOLUTION_TYPE_IDENTIFICATION_PROMPT
                }else{
                    console.log(isStuck, "!isStuck");
                    return ROOT_CAUSE_IDENTIFICATION_PROMPT
                }
            }else{
                console.log("not been more than 3 messages");
                return ROOT_CAUSE_IDENTIFICATION_PROMPT
            }
        }
    }

    if(status === "solutionTypeIdentification") {
        let solutionType = await callLLM(SOLUTION_TYPE_IDENTIFICATION_CHECK,history)
        console.log(solutionType, "solutionType");
        if(solutionType.includes("short-term")){
            return SHORT_TERM_SOLUTION_PROMPT
        }else if(solutionType.includes("root-cause")){ 
            return ROOT_CAUSE_IDENTIFICATION_PROMPT
        }else{
            return SOLUTION_TYPE_IDENTIFICATION_PROMPT
        }
    }

    if(status === "shortTermSolution") {
        // sendShortTermSolutionPrompt
        return SHORT_TERM_SOLUTION_PROMPT
    }


    return ROOT_CAUSE_IDENTIFICATION_PROMPT
}

function getStatusFromPrompt(prompt: string): string {
    // Use Object.keys to get the keys of the mapping
    const status = Object.keys(promptToStatusMapping).find(
        (key) => promptToStatusMapping[key as keyof typeof promptToStatusMapping] === prompt
    ) as keyof typeof promptToStatusMapping;
    
    // Log the resulting status
    console.log("New Status:", status);

    return status;
}



const handleRequest = async ({
    numberOfUserMessages,
    initialStatus, // Changed the parameter name to avoid conflicts
    history,
    prompt,
    userId,
    source,
    streaming,
  }: {
    numberOfUserMessages: number;
    initialStatus: string; // Changed the parameter name to avoid conflicts
    history: string;
    prompt: string;
    userId: string;
    source: boolean;
    streaming: boolean;
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
        streaming,
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
  
    //   console.log("previous getting prompt");
      let newPrompt = await getNewPrompt(
        numberOfUserMessages,
        initialStatus, // Use the initialStatus parameter here
        history
      );
    //   console.log("post getting prompt");
  
      const chatPrompt = ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(newPrompt), // Use the newPrompt here
        HumanMessagePromptTemplate.fromTemplate(`{question}`),
      ]);
  
      const chain = new LLMChain({
        llm: model,
        prompt: chatPrompt,
      });
  
    //   console.log("previous calling chain");
      let chat_history = history;
      const response = await chain.call({ question: prompt, chat_history });
  
    //   console.log("post getting chain");
      if (!streaming) {
        channel.publish({
          data: {
            event: "response",
            token: response.text,
            interactionId,
          },
        });
      }
  
      if (source) {
        const pageContents: string[] = [];
  
        let index = 1;
        response.sourceDocuments.forEach((source: PageSource) => {
          const { pageContent, metadata: { url } } = source;
  
          if (!pageContents.includes(pageContent)) {
            const token = `<br/><b>Source #${index}</b>
                                      <br/>${pageContent}
                                      <br/><a href="${url}" target="_blank">${url}</a>`;
  
            channel.publish({
              data: {
                event: "response",
                token: "<br/>" + token,
                interactionId,
              },
            });
  
            pageContents.push(pageContent);
            index++;
          }
        });
      }
      // Call getStatusFromPrompt
      const status = getStatusFromPrompt(newPrompt);
      console.log("------------******************start of handle request******************----------------")
      return status;
    } catch (error) {
      console.error(error);
    }
  };
  

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const {  body: { numberOfUserMessages, initialStatus, history, prompt, userId, source, streaming } } = req
    let newStatus = await handleRequest({ numberOfUserMessages, initialStatus, history, prompt, userId, source, streaming})
    res.status(200).json({ "message": "started", status: newStatus })
}

