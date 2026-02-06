require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const OpenAI = require("openai");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==================== TELEGRAM BOT CONFIGURATION ====================

const BOT_TOKEN = process.env.BOT_TOKEN;
const MINI_APP_URL = process.env.MINI_APP_URL;
const SUPPORT_USERNAME =
  process.env.SUPPORT_USERNAME || "araks_support";

// ایجاد ربات تلگرام (فقط اگر BOT_TOKEN موجود باشد)
let bot;
if (BOT_TOKEN) {
  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  console.log("🤖 Telegram Bot started successfully!");
} else {
  console.log("⚠️  BOT_TOKEN not found. Telegram bot is disabled.");
}

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
    createdAt: {
      type: Date,
      default: Date.now(),
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

// ==================== TELEGRAM BOT HANDLERS ====================

if (bot) {
  // متن پیام خوش‌آمدگویی
  const WELCOME_MESSAGE = `
🌟 به ربات رسمی آراکس گروپ خوش آمدید! 🇦🇲

ما در زمینه ارائه خدمات اقامت و مهاجرت به ارمنستان فعالیت می‌کنیم.

📱 برای دسترسی به تمام خدمات ما، مینی اپ را باز کنید
💬 یا می‌توانید مستقیماً با پشتیبانی ما در ارتباط باشید

خدمات ما:
✅ دریافت کارت اقامت
🏠 پیداکردن خانه برای اجاره
🏨 رزرو هتل و سوییت
✈️ ترانسفر فرودگاهی
💱 صرافی و اکسچنج
🎓 ثبت نام دانشگاه و مدارس
📅 اخذ وقت سفارت

لطفاً یکی از گزینه‌های زیر را انتخاب کنید:
`;

  // کیبورد اینلاین با دکمه‌ها
  const getWelcomeKeyboard = () => {
    return {
      inline_keyboard: [
        [
          {
            text: "🚀 باز کردن مینی اپ",
            web_app: { url: MINI_APP_URL },
          },
        ],
        [
          {
            text: "💬 ارتباط با پشتیبانی",
            url: `https://t.me/${SUPPORT_USERNAME}`,
          },
        ],
        [
          {
            text: "📞 تماس تلفنی",
            callback_data: "contact_phone",
          },
          {
            text: "📧 ایمیل",
            callback_data: "contact_email",
          },
        ],
      ],
    };
  };

  // تابع ثبت کاربر در دیتابیس
  async function registerUserFromBot(userData) {
    try {
      const fullName =
        `${userData.first_name || ""} ${userData.last_name || ""}`.trim();

      let user = await User.findOne({
        telegramId: userData.id.toString(),
      });

      if (user) {
        user.userName = userData.username || user.userName;
        user.fullName = fullName || user.fullName;
        await user.save();
        console.log(`✅ User ${userData.id} updated from bot`);
      } else {
        user = new User({
          telegramId: userData.id.toString(),
          userName: userData.username || "",
          fullName: fullName || "",
          imageUrl: "",
          chat: [],
        });
        await user.save();
        console.log(`✅ New user ${userData.id} created from bot`);
      }

      return user;
    } catch (error) {
      console.error(
        "❌ Error registering user from bot:",
        error.message,
      );
      return null;
    }
  }

  // دستور /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;

    console.log(`📩 /start command received from user ${user.id}`);

    // ثبت کاربر در دیتابیس
    await registerUserFromBot(user);

    // ارسال پیام خوش‌آمدگویی
    try {
      await bot.sendMessage(chatId, WELCOME_MESSAGE, {
        reply_markup: getWelcomeKeyboard(),
        parse_mode: "Markdown",
      });
    } catch (error) {
      console.error(
        "❌ Error sending welcome message:",
        error.message,
      );
    }
  });

  // دستور /help
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    const helpMessage = `
📚 راهنمای استفاده از ربات:

/start - شروع مجدد ربات
/help - نمایش این راهنما
/services - لیست خدمات ما
/contact - اطلاعات تماس

🔹 برای استفاده از مینی اپ، روی دکمه "باز کردن مینی اپ" کلیک کنید.
🔹 برای ارتباط مستقیم با پشتیبانی، روی دکمه "ارتباط با پشتیبانی" کلیک کنید.

در صورت نیاز به کمک، با پشتیبانی ما تماس بگیرید.
    `;

    await bot.sendMessage(chatId, helpMessage, {
      reply_markup: getWelcomeKeyboard(),
    });
  });

  // دستور /services
  bot.onText(/\/services/, async (msg) => {
    const chatId = msg.chat.id;

    const servicesMessage = `
🎯 خدمات آراکس گروپ:

1️⃣ دریافت کارت اقامت
   • اقامت کاری
   • اقامت تحصیلی
   • اقامت خانوادگی
   • اقامت سرمایه‌گذاری

2️⃣ پیداکردن خانه برای اجاره
   • مشاوره رایگان
   • بازدید از خانه‌ها
   • تنظیم قرارداد

3️⃣ رزرو هتل و سوییت روزانه
   • بهترین قیمت‌ها
   • تایید آنی

4️⃣ ترانسفر فرودگاهی
   • راننده مجرب
   • خودروهای مدل بالا

5️⃣ صرافی و اکسچنج
   • بهترین نرخ روز
   • تراکنش سریع و امن

6️⃣ ثبت نام دانشگاه و مدارس
   • راهنمایی کامل
   • پیگیری پذیرش

7️⃣ اخذ وقت سفارت
   • دریافت سریع وقت
   • مشاوره مدارک

برای اطلاعات بیشتر، مینی اپ را باز کنید یا با پشتیبانی تماس بگیرید.
    `;

    await bot.sendMessage(chatId, servicesMessage, {
      reply_markup: getWelcomeKeyboard(),
    });
  });

  // دستور /contact
  bot.onText(/\/contact/, async (msg) => {
    const chatId = msg.chat.id;

    const contactMessage = `
📞 اطلاعات تماس:

📱 تلگرام: @${SUPPORT_USERNAME}
📧 ایمیل: info@araksgroup.com
☎️ تلفن: +374 12 345 6789

📍 آدرس دفتر:
Fuchik 32/2, Yerevan, Armenia

🕐 ساعات کاری:
دوشنبه تا شنبه
10:00 صبح - 6:00 عصر (به وقت ایروان)

برای ارتباط سریع‌تر، از دکمه‌های زیر استفاده کنید:
    `;

    await bot.sendMessage(chatId, contactMessage, {
      reply_markup: getWelcomeKeyboard(),
    });
  });

  // مدیریت هر نوع پیام متنی
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // اگر پیام یک دستور نبود
    if (text && !text.startsWith("/")) {
      console.log(
        `📩 Message received from user ${msg.from.id}: ${text}`,
      );

      // ثبت کاربر در دیتابیس
      await registerUserFromBot(msg.from);

      // ارسال پیام راهنما
      const responseMessage = `
دوست عزیز، از تماس شما با آراکس گروپ متشکریم! 🙏

برای دریافت بهترین خدمات، لطفاً از یکی از گزینه‌های زیر استفاده کنید:

🚀 مینی اپ ما را باز کنید تا به تمام خدمات دسترسی داشته باشید
💬 یا مستقیماً با پشتیبانی ما گفتگو کنید

ما آماده‌ایم تا در هر مرحله از مهاجرت به ارمنستان همراه شما باشیم! 🇦🇲
      `;

      await bot.sendMessage(chatId, responseMessage, {
        reply_markup: getWelcomeKeyboard(),
      });
    }
  });

  // مدیریت کال‌بک‌ها (دکمه‌های اینلاین)
  bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    console.log(
      `🔘 Callback received: ${data} from user ${callbackQuery.from.id}`,
    );

    switch (data) {
      case "contact_phone":
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(
          chatId,
          `📞 تماس تلفنی:\n\n+374 12 345 6789\n\nپاسخگویی 24/7\n\nبرای تماس، می‌توانید از تلگرام یا تماس مستقیم استفاده کنید.`,
        );
        break;

      case "contact_email":
        await bot.answerCallbackQuery(callbackQuery.id);
        await bot.sendMessage(
          chatId,
          `📧 ایمیل:\n\ninfo@araksgroup.com\n\nپاسخ طی 24 ساعت\n\nلطفاً سوالات خود را به صورت کامل ارسال کنید تا بهترین راهنمایی را دریافت کنید.`,
        );
        break;

      default:
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: "گزینه نامعتبر!",
        });
    }
  });

  // مدیریت خطاهای ربات
  bot.on("polling_error", (error) => {
    console.error("❌ Bot polling error:", error.message);
  });

  bot.on("error", (error) => {
    console.error("❌ Bot error:", error.message);
  });
}

// ==================== API ROUTES ====================

// Health Check
app.get("/", (req, res) => {
  res.json({
    message: "Telegram Chat Bot API is running!",
    status: "OK",
    botStatus: bot ? "Active" : "Disabled",
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

// Delete Chat History Route
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

// Get User Info Route
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

// مدیریت سیگنال‌های خروج
process.on("SIGINT", () => {
  console.log("\n🛑 Server is shutting down...");
  if (bot) {
    bot.stopPolling();
  }
  mongoose.connection.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Server is shutting down...");
  if (bot) {
    bot.stopPolling();
  }
  mongoose.connection.close();
  process.exit(0);
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/`);
  if (bot) {
    console.log(
      `✅ Telegram Bot is active and listening for messages!`,
    );
  }
});
