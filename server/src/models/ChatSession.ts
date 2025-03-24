import mongoose, { Document, Schema } from 'mongoose';

interface IMessage {
  sender: string;
  content: string;
  timestamp: Date;
}

interface IChatSession extends Document {
  sessionId: string;
  participants: string[];
  messages: IMessage[];
  startTime: Date;
  endTime?: Date;
  isActive: boolean;
}

const MessageSchema = new Schema<IMessage>({
  sender: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const ChatSessionSchema = new Schema<IChatSession>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    participants: [
      {
        type: String,
        required: true,
      },
    ],
    messages: [MessageSchema],
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries by participant
ChatSessionSchema.index({ participants: 1 });
ChatSessionSchema.index({ sessionId: 1 });
ChatSessionSchema.index({ isActive: 1 });

const ChatSession = mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);

export default ChatSession; 