import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

function escapePowerShellLiteral(value) {
  return value.replace(/'/g, "''");
}

export async function getOwnerAndAttributes(filePath) {
  if (process.platform !== "win32") {
    return {
      owner: process.env.USER || process.env.USERNAME || "Unknown",
      isHidden: false,
      isSystem: false
    };
  }

  try {
    const safePath = escapePowerShellLiteral(filePath);
    const command = [
      "$item = Get-Item -LiteralPath '" + safePath + "' -Force;",
      "$owner = (Get-Acl -LiteralPath '" + safePath + "').Owner;",
      "$attrs = $item.Attributes.ToString();",
      "@{ owner = $owner; attributes = $attrs } | ConvertTo-Json -Compress"
    ].join(" ");

    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-Command", command],
      { windowsHide: true }
    );

    const parsed = JSON.parse(stdout.trim() || "{}");
    const attributes = String(parsed.attributes || "");

    return {
      owner: parsed.owner || process.env.USERNAME || "Unknown",
      isHidden: attributes.toLowerCase().includes("hidden"),
      isSystem: attributes.toLowerCase().includes("system")
    };
  } catch (error) {
    return {
      owner: process.env.USERNAME || "Unknown",
      isHidden: false,
      isSystem: false
    };
  }
}

export async function getOwner(filePath) {
  const result = await getOwnerAndAttributes(filePath);
  return result.owner;
}
