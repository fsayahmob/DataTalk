import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const { question } = await request.json();

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Question manquante" },
        { status: 400 }
      );
    }

    // Appel au backend FastAPI
    const response = await fetch(`${FASTAPI_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || "Erreur du backend FastAPI" },
        { status: response.status }
      );
    }

    return NextResponse.json(data);

  } catch (error) {
    console.error("Erreur API:", error);
    return NextResponse.json(
      { error: "Erreur de connexion au backend FastAPI" },
      { status: 500 }
    );
  }
}
