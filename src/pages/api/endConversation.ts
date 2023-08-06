import Ably from "ably/promises"
import { ConversationLog } from "./conversationLog";
import { NextApiRequest, NextApiResponse } from "next"


const ably = new Ably.Realtime({ key: process.env.ABLY_API_KEY})

const handleRequest = async({ userId }: { userId: string }) => {
    try {
        const channel = ably.channels.get(userId)
        if(!userId) {
            return
        }
        
        const conversationLog = new ConversationLog(userId)
        console.log(userId)
        const conversationHistory = await conversationLog.getUserConverstion({ limit: 100})
        // return conversationHistory
        // 1802|aIRCetmejqrojyz8IFGIOizUhfm02qQuqMQsz1SG
        console.log(conversationHistory)
        const response = await fetch("https://zylalabs.com/api/2210/text+entities+extractor+api/2057/get+entities", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer 1802|aIRCetmejqrojyz8IFGIOizUhfm02qQuqMQsz1SG"
            },
            body: JSON.stringify({ 
                "text" : conversationHistory.join(" "),
                "entities" : [
                    {
                        "var_name": "symptoms",
                        "type": "string",
                        "description": "feeling sad, irritable, changes in sleep pattern, difficulty concentrating, or thoughts of self-harm"
                    },
                    {
                        "var_name": "behaviors",
                        "type": "string",
                        "description": "behavioral change like appetite change, change in activity level, social withdrawal, risky behavior"
                    },
                    {
                        "var_name": "experience",
                        "type": "string",
                        "description": "significant experiences or events in persons life like traumatic experiences, or major life changes"
                    },
                    {
                        "var_name": "coping",
                        "type": "string",
                        "description": "coping strategies used to manage mental health like exercise, meditation, talking to friends"
                    },
                    {
                        "var_name": "support",
                        "type": "string",
                        "description": "person support network, family, friends, individuals they rely on for emotional support"
                    },
                ]
            }), // Include the selected topic in the user input
        });
        return await response.json();
    } catch(error) { 
        console.error(error, "============+++++++ERROR IN ENDCONVERSATION.TS+++++++++================")
    }
}


export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const {  body: { userId } } = req
    let val = await handleRequest({ userId })
    res.status(200).json(val)
}