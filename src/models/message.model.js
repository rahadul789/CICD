import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    author: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80
    },
    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000
    },
    source: {
      type: String,
      enum: ['api', 'socket'],
      default: 'api'
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
    }
  }
);

messageSchema.index({ createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
