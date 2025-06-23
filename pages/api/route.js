import { NextResponse } from 'next/server';

/**
 * @param {Request} request - The incoming request object.
 */
export default async function POST(request) {
  // To get query params, you must parse the URL
  const { searchParams } = new URL(request.url);
  const apikey  = searchParams.get('apikey');

  // To get the body, you must await the .json() method
  const { newName } = await request.json();

  return NextResponse.json({ id: userId, name: newName });
}
