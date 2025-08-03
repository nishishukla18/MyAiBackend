// import { clerkClient } from "@clerk/express";

// export const auth = async (req, res, next) => {
//     try {
//         const {userId,has} = await req.auth()
//         const hasPremiumPlan = await has({plan:'premium'})
//         const user = await clerkClient.users.getUser(userId);
//         if(!hasPremiumPlan && user.privateMetadata.free_usage) {
//             req.free_usage = user.privateMetadata.free_usage
//         }else{
//             await clerkClient.users.updateUserMetadata(userId, {
//                 privateMetadata: {free_usage: 0 }   
//         })
//         req.free_usage = 0
//         }
//         req.plan = hasPremiumPlan ? 'premium' : 'free';
//         next()
//     } catch (error) {
//         return res.status(401).json({ message: 'Unauthorized' });
        
//     }
// }

import { clerkClient } from "@clerk/express";

export const auth = async (req, res, next) => {
    try {
        const {userId, has} = await req.auth();
        const hasPremiumPlan = await has({plan: 'premium'});
        const user = await clerkClient.users.getUser(userId);
        
        // Initialize free usage if it doesn't exist
        if (!hasPremiumPlan) {
            if (user.privateMetadata.freeUsage !== undefined) {
                req.free_usage = user.privateMetadata.freeUsage;
            } else {
                // Initialize free usage to 0 for new users
                await clerkClient.users.updateUserMetadata(userId, {
                    privateMetadata: { freeUsage: 0 }   
                });
                req.free_usage = 0;
            }
        } else {
            req.free_usage = 0; // Premium users don't have usage limits
        }
        
        req.plan = hasPremiumPlan ? 'premium' : 'free';
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(401).json({ message: 'Unauthorized' });
    }
}