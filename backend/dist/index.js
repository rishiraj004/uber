"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const prisma_1 = require("./config/prisma");
const PORT = process.env.PORT || 3000;
(0, prisma_1.connectDB)().then(() => {
    app_1.default.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch((error) => {
    console.error('Failed to connect to the database', error);
});
