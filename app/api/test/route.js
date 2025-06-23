import { NextResponse } from 'next/server';

/**
 * Handles GET requests to /api/items
 * @param {import('next/server').NextRequest} request
 */
export async function GET(request) {
  // To get query params, you must access the URL object
  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category'); // e.g., /api/items?category=books

  const responseData = {
    message: "Data from App Router",
    category: category || "all",
  };

  return NextResponse.json(responseData);
}

/**
 * Handles POST requests to /api/items
 * @param {import('next/server').NextRequest} request
 */
export async function POST(request) {
  // To get the request body, you must await the .json() method
  const body = await request.json();
  console.log(body)
  const responseData = {
    message: "Item created successfully!",
    receivedItem: body,
  };

  return NextResponse.json(responseData, { status: 201 }); // Created
}
