export const addTemplateElements = (elements) => {
    elements.filter(e => e.type = 'component').forEach(c => {
        console.log(c);
    });
    return elements;
}


