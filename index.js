require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MongoDB Connection
mongoose
  .connect(
    "mongodb+srv://xchat:Abolfazl021_@db1.6qsnqns.mongodb.net/?appName=db1",
  )
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// User Schema
const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    userName: {
      type: String,
      default: "",
    },
    fullName: {
      type: String,
      default: "",
    },
    chat: [
      {
        message: {
          type: String,
          required: true,
        },
        time: {
          type: Date,
          default: Date.now,
        },
        from: {
          type: String,
          enum: ["ai", "user"],
          required: true,
        },
      },
    ],
  },
  { timestamps: true },
);

const User = mongoose.model("AraxUser", userSchema);

// ==================== ROUTES ====================

// Health Check
app.get("/", (req, res) => {
  res.json({
    message: "Telegram Chat Bot API is running!",
    status: "OK",
    timestamp: new Date().toISOString(),
  });
});

// Check User Route
app.post("/api/checkUser", async (req, res) => {
  try {
    const { telegramId, firstName, lastName, username, photoUrl } =
      req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "telegramId is required",
      });
    }

    // ساخت fullName از firstName و lastName
    const fullName = `${firstName || ""} ${lastName || ""}`.trim();

    // پیدا کردن یا ساخت کاربر
    let user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (user) {
      // اگر کاربر وجود داشت، اطلاعات را آپدیت کن
      user.userName = username || user.userName;
      user.fullName = fullName || user.fullName;
      user.imageUrl = photoUrl || user.imageUrl;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "User updated successfully",
        user: {
          telegramId: user.telegramId,
          userName: user.userName,
          fullName: user.fullName,
          imageUrl: user.imageUrl,
          messageCount: user.chat.length,
        },
        isNewUser: false,
      });
    } else {
      // اگر کاربر وجود نداشت، کاربر جدید بساز
      user = new User({
        telegramId: telegramId.toString(),
        userName: username || "",
        fullName: fullName || "",
        imageUrl: photoUrl || "",
        chat: [],
      });
      await user.save();

      return res.status(201).json({
        success: true,
        message: "New user created successfully",
        user: {
          telegramId: user.telegramId,
          userName: user.userName,
          fullName: user.fullName,
          imageUrl: user.imageUrl,
          messageCount: 0,
        },
        isNewUser: true,
      });
    }
  } catch (error) {
    console.error("Error in checkUser:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Get Messages Route
app.get("/api/messages", async (req, res) => {
  try {
    const { telegramId } = req.query;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "telegramId is required",
      });
    }

    const user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // فرمت کردن پیام‌ها برای فرانت‌اند
    const formattedMessages = user.chat.map((msg) => ({
      id: msg._id.toString(),
      text: msg.message,
      sender: msg.from === "user" ? "user" : "ai",
      time: new Date(msg.time).toLocaleTimeString("fa-IR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      timestamp: msg.time,
    }));

    return res.status(200).json(formattedMessages);
  } catch (error) {
    console.error("Error in getMessages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Send Message Route
app.post("/api/messages", async (req, res) => {
  try {
    const { telegramId, text, sender } = req.body;

    if (!telegramId || !text || !sender) {
      return res.status(400).json({
        success: false,
        message: "telegramId, text, and sender are required",
      });
    }

    // پیدا کردن کاربر
    let user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      // اگر کاربر وجود نداشت، ایجاد کن
      user = new User({
        telegramId: telegramId.toString(),
        chat: [],
      });
    }

    // ذخیره پیام کاربر
    const userMessage = {
      message: text,
      time: new Date(),
      from: "user",
    };
    user.chat.push(userMessage);
    await user.save();

    // ارسال پاسخ اولیه به فرانت
    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      messageId: user.chat[user.chat.length - 1]._id.toString(),
    });

    // پردازش پیام با AI (به صورت async)
    processAIResponse(telegramId.toString(), text, user.chat);
  } catch (error) {
    console.error("Error in sendMessage:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Function to Process AI Response
async function processAIResponse(
  telegramId,
  userMessage,
  chatHistory,
) {
  try {
    // ساخت تاریخچه چت برای OpenAI
    const messages = [
      {
        role: "system",
        content: `تو یک دستیار هوشمند و مفید هستی که به زبان فارسی پاسخ می‌دهی. وظیفه‌ات کمک به کاربران در مورد خدمات اقامتی و مهاجرتی است. پاسخ‌هایت باید مودبانه، دقیق و مفید باشند. همیشه سعی کن به سوالات کاربر به بهترین شکل پاسخ دهی و در صورت نیاز اطلاعات بیشتری درخواست کن.`,
      },
    ];

    // اضافه کردن تاریخچه چت (آخرین 10 پیام)
    const recentChat = chatHistory.slice(-10);
    recentChat.forEach((msg) => {
      messages.push({
        role: msg.from === "user" ? "user" : "assistant",
        content: msg.message,
      });
    });

    // درخواست به OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const aiResponse = completion.choices[0].message.content;

    // ذخیره پاسخ AI در دیتابیس
    const user = await User.findOne({ telegramId });
    if (user) {
      user.chat.push({
        message: aiResponse,
        time: new Date(),
        from: "ai",
      });
      await user.save();
      console.log(`✅ AI response saved for user ${telegramId}`);
    }
  } catch (error) {
    console.error("Error in processAIResponse:", error);

    // در صورت خطا، یک پیام پیش‌فرض ذخیره کن
    try {
      const user = await User.findOne({ telegramId });
      if (user) {
        user.chat.push({
          message:
            "متاسفم، در حال حاضر مشکلی پیش آمده است. لطفاً بعداً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.",
          time: new Date(),
          from: "ai",
        });
        await user.save();
      }
    } catch (saveError) {
      console.error("Error saving fallback message:", saveError);
    }
  }
}

// Delete Chat History Route (اختیاری - برای پاک کردن تاریخچه چت)
app.delete("/api/messages", async (req, res) => {
  try {
    const { telegramId } = req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "telegramId is required",
      });
    }

    const user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.chat = [];
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Chat history deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteMessages:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Get User Info Route (اختیاری)
app.get("/api/user/:telegramId", async (req, res) => {
  try {
    const { telegramId } = req.params;

    const user = await User.findOne({
      telegramId: telegramId.toString(),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        telegramId: user.telegramId,
        userName: user.userName,
        fullName: user.fullName,
        imageUrl: user.imageUrl,
        messageCount: user.chat.length,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error in getUserInfo:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message,
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/`);
});
