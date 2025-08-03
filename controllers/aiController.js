import axios from "axios";
import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express"; 
import {v2 as cloudinary} from 'cloudinary';
import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import FormData from 'form-data';

const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export const generateArticle = async (req, res) => {
    try {
        const {userId} = req.auth()
        const {prompt, length} = req.body;
        const plan = req.plan;
        const freeUsage = req.free_usage 

        // Check if user has exceeded free usage
        if (plan !== 'premium' && freeUsage >= 10) {
            return res.status(403).json({ message: 'Free usage limit exceeded. Upgrade to premium for more requests.' });
        }

        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: length,
        });
        
        const content = response.choices[0].message.content

        // Save to database
        await sql`INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, ${prompt}, ${content}, 'article')`;

        // Update free usage (INCREMENT, not decrement)
        if(plan !== 'premium'){
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    freeUsage: freeUsage + 1 // INCREMENT by 1, not subtract 10
                }
            });
        }
        
        res.json({success: true, content});
        
    } catch (error) {
        console.error('Error generating article:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

export const generateBlogTitle = async (req, res) => {
    try {
        const {userId} = req.auth()
        const {prompt} = req.body;
        const plan = req.plan;
        const freeUsage = req.free_usage 

        // Check if user has exceeded free usage
        if (plan !== 'premium' && freeUsage >= 10) {
            return res.status(403).json({ message: 'Free usage limit exceeded. Upgrade to premium for more requests.' });
        }

        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 100,
        });
        
        const content = response.choices[0].message.content

        // Save to database
        await sql`INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, ${prompt}, ${content}, 'blog-title')`;

        // Update free usage (INCREMENT, not decrement)
        if(plan !== 'premium'){
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    freeUsage: freeUsage + 1 
                }
            });
        }
        
        res.json({success: true, content});
        
    } catch (error) {
        console.error('Error generating blog-title:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

export const generateImage = async (req, res) => {
    try {
        const {userId} = req.auth()
        const {prompt, publish} = req.body;
        const plan = req.plan;

        // Check if user has exceeded free usage
        if (plan !== 'premium' ) {
            return res.status(403).json({ message: 'This feature is only available for premium users.'});
        }
        const formData = new FormData()
        formData.append('prompt', prompt)

        const {data} = await axios.post('https://clipdrop-api.co/text-to-image/v1',formData,{
            headers: {
                'x-api-key': process.env.CLIPDROP_API_KEY,
            },
            responseType: 'arraybuffer'
        })
        const base64Image = `data:image/png;base64,${Buffer.from(data,'binary').toString('base64')}`;

        const {secure_url} = await cloudinary.uploader.upload(base64Image) 

        // Save to database
        await sql`INSERT INTO creations (user_id, prompt, content, type, publish) VALUES(${userId}, ${prompt}, ${secure_url}, 'image',${publish ?? false})`;
       
        await clerkClient.users.updateUserMetadata(userId, {
            privateMetadata: {
                freeUsage: freeUsage + 1
            }
        })
        res.json({success: true, content: secure_url});
        
    } catch (error) {
        console.error('Error generating image:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
export const removeImageBackground = async (req, res) => {
  try {
    const { userId } = req.auth();
    const plan = req.plan;
    const freeUsage = req.free_usage;
    const image = req.file;

    if (plan !== "premium") {
      return res
        .status(403)
        .json({ message: "This feature is only available for premium users." });
    }

    const { public_id } = await cloudinary.uploader.upload(image.path);

    const imageUrl = cloudinary.url(public_id, {
      transformation: [{ effect: "gen_remove:background" }],
      resource_type: "image",
    });

    await sql`INSERT INTO creations (user_id, prompt, content, type, publish) VALUES(${userId}, 'Remove background from image', ${imageUrl}, 'image', false)`;

    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { freeUsage: freeUsage + 1 },
    });

    res.json({ success: true, content: imageUrl });
  } catch (error) {
    console.error("Error removing background:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};
export const removeImageObject = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { object } = req.body;
    const image = req.file;
    const plan = req.plan;
    const freeUsage = req.free_usage;

    if (plan !== "premium") {
      return res
        .status(403)
        .json({ message: "This feature is only available for premium users." });
    }

    const { secure_url } = await cloudinary.uploader.upload(image.path, {
      transformation: [
        {
          effect: "backgr_removal",
          background_removal: "remove_the_background",
        },
      ],
    });

    await sql`INSERT INTO creations (user_id, prompt, content, type, publish) VALUES(${userId}, ${`Removed ${object} from image`}, ${secure_url}, 'image', false)`;

    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { freeUsage: freeUsage + 1 },
    });

    res.json({ success: true, content: secure_url });
  } catch (error) {
    console.error("Error removing object from image:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}; 
export const reviewResume = async (req, res) => {
  try {
    const { userId } = req.auth();
    const resume = req.file;
    const plan = req.plan;
    const freeUsage = req.free_usage;

    if (plan !== "premium") {
      return res
        .status(403)
        .json({ message: "This feature is only available for premium users." });
    }

    if (resume.size > 5 * 1024 * 1024) {
      return res.status(400).json({ message: "Resume file size exceeds 5MB limit." });
    }

    const dataBuffer = fs.readFileSync(resume.path);
    const pdfData = await pdf(dataBuffer);
    const prompt = `Review the following resume and provide feedback:\n\n${pdfData.text}`;

    const response = await AI.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content;

    await sql`INSERT INTO creations (user_id, prompt, content, type) VALUES(${userId}, ${prompt}, ${content}, 'resume-review')`;

    await clerkClient.users.updateUserMetadata(userId, {
      privateMetadata: { freeUsage: freeUsage + 1 },
    });

    res.json({ success: true, content });
  } catch (error) {
    console.error("Error reviewing resume:", error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};