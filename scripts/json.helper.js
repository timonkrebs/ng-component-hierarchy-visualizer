
export const stripJsonComments = (json) => {
    return json.replace(/("(\\.|[^\\"])*")|(\/\/.*)|(\/\*[\s\S]*?\*\/)/g, (match, stringGroup) => {
        if (stringGroup) return stringGroup; // preserve string
        return ""; // strip comment
    });
};
