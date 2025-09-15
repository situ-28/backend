import User from "../schema/userSchema.js";

// Get all users (excluding current logged-in user)
export const getAllUsers = async (req, res) => {
    try {
        const currentUserID = req.user?._id?.toString();
        if (!currentUserID) return res.status(401).json({ success: false, message: "Unauthorized." });

        // Exclude current user; return minimal fields used by UI
        const users = await User.find({ _id: { $ne: currentUserID } }, "_id profilepic email username");
        return res.status(200).json({ success: true, users });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Search user by username or email (case-insensitive, partial)
export const getUserByUsernameOrEmail = async (req, res) => {
    const { query } = req.query;
    if (!query) return res.status(400).json({ success: false, message: "Query is required." });

    try {
        const regex = new RegExp(query, 'i');
        const users = await User.find(
            { $or: [{ username: regex }, { email: regex }] },
            "_id fullname email username profilepic"
        ).limit(10);

        if (!users?.length) return res.status(404).json({ success: false, message: "User not found." });

        return res.status(200).json({ success: true, users });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Get user by ID
export const getUserById = async (req, res) => {
    const { id } = req.params;

    try {
        const user = await User.findById(id, "_id fullname email username gender profilepic");
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        return res.status(200).json({ success: true, user });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Invalid user ID." });
    }
};